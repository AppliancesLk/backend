import {
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { sessionDuration } from '../session.config';
import { NotificationService } from '../../notification/notification.service';
import { AccountActionsService } from './account-actions.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    private readonly notifications: NotificationService,
    private readonly actions: AccountActionsService,
    private readonly dataSource: DataSource,
  ) {}

  publicUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  async register(dto: RegisterDto) {
    if (
      (await this.usersService.findByEmail(dto.email)) ||
      (await this.usersService.findByUsername(dto.username))
    ) {
      throw new ConflictException('Username or email is already registered');
    }
    // bcrypt only handles up to 72 bytes, including multi-byte characters.
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new ConflictException('Password must be at most 72 bytes');
    const hash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.usersService.createCustomer(
        dto.email,
        dto.username,
        hash,
      );
      const sent = await this.actions.sendVerification(user.id);
      return {
        requiresVerification: true as const,
        email: user.email,
        message: sent
          ? 'Account created. Check your email to verify your address before signing in.'
          : 'Account created. We could not send the verification email. Request a new link on the verification page.',
      };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Username or email is already registered');
      if (error instanceof HttpException) throw error;
      this.logger.error({ operation: 'auth.register.failed' });
      throw new InternalServerErrorException(
        'Unable to create your account. Please try again',
      );
    }
  }

  async login(dto: LoginDto) {
    const user = dto.username.includes('@')
      ? await this.usersService.findByEmail(dto.username)
      : await this.usersService.findByUsername(dto.username);
    if (
      !user ||
      user.deactivatedAt ||
      Buffer.byteLength(dto.password, 'utf8') > 72 ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (!user.emailVerifiedAt)
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Verify your email address before signing in. You can request a new verification link.',
      });
    if (!user.isActive)
      throw new UnauthorizedException('Invalid username or password');
    const session = await this.createSession(user);
    await this.notifications.sendLoginNotification(user.id);
    return session;
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createSession(user: User) {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
    const token = randomBytes(32).toString('hex');
    await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !current?.isActive ||
        !current.emailVerifiedAt ||
        current.passwordHash !== user.passwordHash
      )
        throw new UnauthorizedException(
          'Account details changed. Please sign in again',
        );
      await manager.save(
        AuthSession,
        manager.create(AuthSession, {
          tokenHash: this.hash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + sessionDuration()),
        }),
      );
    });
    return { token, user: this.publicUser(user) };
  }

  async authenticate(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Please sign in');
    const session = await this.sessions.findOne({
      where: { tokenHash: this.hash(token) },
      relations: { user: true },
    });
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive ||
      !session.user.emailVerifiedAt
    ) {
      if (session) await this.sessions.delete({ tokenHash: session.tokenHash });
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again',
      );
    }
    return this.publicUser(session.user);
  }

  async logout(token?: string) {
    if (token) await this.sessions.delete({ tokenHash: this.hash(token) });
  }
}
