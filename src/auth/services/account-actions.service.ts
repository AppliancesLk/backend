import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  AccountAction,
  type AccountActionPurpose,
} from '../entities/account-action.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class AccountActionsService {
  private readonly logger = new Logger(AccountActionsService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly notifications: NotificationService,
  ) {}

  async sendVerification(userId: string) {
    return this.issue(userId, 'VERIFY_EMAIL');
  }

  async request(email: string, purpose: AccountActionPurpose) {
    const user = await this.users.findByEmail(email);
    if (user) await this.issue(user.id, purpose);
    return {
      message:
        purpose === 'VERIFY_EMAIL'
          ? 'If this account needs verification, an email with the next steps will arrive shortly. You can request another link after one minute.'
          : 'If an active account matches that email, password reset instructions will arrive shortly. You can request another link after one minute.',
    };
  }

  private async issue(userId: string, purpose: AccountActionPurpose) {
    const token = randomBytes(32).toString('hex');
    const issued = await this.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user ||
        user.deactivatedAt ||
        (purpose === 'VERIFY_EMAIL'
          ? Boolean(user.emailVerifiedAt)
          : !user.isActive || !user.emailVerifiedAt)
      )
        return false;
      const existing = await manager.findOne(AccountAction, {
        where: { userId, purpose },
      });
      if (existing && existing.createdAt.getTime() > Date.now() - 60_000)
        return false;
      await manager.delete(AccountAction, { userId, purpose });
      await manager.save(
        AccountAction,
        manager.create(AccountAction, {
          userId,
          purpose,
          tokenHash: this.hash(token),
          expiresAt: new Date(
            Date.now() + (purpose === 'VERIFY_EMAIL' ? 24 * 60 : 30) * 60_000,
          ),
        }),
      );
      return true;
    });
    if (!issued) return false;
    const result =
      purpose === 'VERIFY_EMAIL'
        ? await this.notifications.sendEmailVerificationEmail(userId, token)
        : await this.notifications.sendPasswordResetEmail(userId, token);
    this.logger.log({
      operation: 'account.action.requested',
      userId,
      purpose,
      deliveryStatus: result.status,
    });
    return result.status === 'SENT';
  }

  async consume(
    token: string,
    purpose: AccountActionPurpose,
    password?: string,
  ) {
    const invalid = () =>
      new BadRequestException(
        'This link is invalid or has expired. Request a new email and try again',
      );
    if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
    if (
      purpose === 'RESET_PASSWORD' &&
      (!password ||
        password.length < 8 ||
        Buffer.byteLength(password, 'utf8') > 72)
    )
      throw new BadRequestException('Password must contain 8–72 bytes');
    const tokenHash = this.hash(token);
    const found = await this.dataSource.manager.findOne(AccountAction, {
      where: { tokenHash, purpose },
    });
    if (!found || found.expiresAt.getTime() <= Date.now()) throw invalid();
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
    await this.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: found.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const action = await manager.findOne(AccountAction, {
        where: { tokenHash, purpose },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user ||
        user.deactivatedAt ||
        !action ||
        action.expiresAt.getTime() <= Date.now()
      )
        throw invalid();
      if (purpose === 'VERIFY_EMAIL') {
        if (user.emailVerifiedAt) throw invalid();
        user.emailVerifiedAt = new Date();
        user.isActive = true;
      } else {
        if (!user.isActive || !user.emailVerifiedAt || !passwordHash)
          throw invalid();
        user.passwordHash = passwordHash;
        await manager.delete(AuthSession, { userId: user.id });
      }
      await manager.save(User, user);
      await manager.delete(AccountAction, { userId: user.id, purpose });
    });
    this.logger.log({
      operation: 'account.action.completed',
      userId: found.userId,
      purpose,
    });
    if (purpose === 'VERIFY_EMAIL')
      await this.notifications.sendWelcomeEmail(found.userId);
    return {
      message:
        purpose === 'VERIFY_EMAIL'
          ? 'Your email is verified. You can now sign in.'
          : 'Your password has been changed. Sign in with your new password.',
    };
  }
  private async transaction<T>(
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(action);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error({ operation: 'account.action.failed' });
      throw new InternalServerErrorException(
        'Unable to update your account. Please try again',
      );
    }
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
