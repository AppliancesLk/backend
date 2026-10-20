import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { AuthSession } from '../../auth/entities/auth-session.entity';
import { AccountAction } from '../../auth/entities/account-action.entity';
import { AdminUsersQueryDto } from '../dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);
  constructor(private readonly dataSource: DataSource) {}
  async list(query: AdminUsersQueryDto) {
    const builder = this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.role',
        'user.isActive',
        'user.emailVerifiedAt',
        'user.deactivatedAt',
        'user.loyaltyBalance',
        'user.createdAt',
      ]);
    if (query.search?.trim())
      builder.andWhere(
        '(user.username ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.status === 'active')
      builder.andWhere(
        'user.isActive = true AND user.emailVerifiedAt IS NOT NULL',
      );
    if (query.status === 'inactive')
      builder.andWhere('user.deactivatedAt IS NOT NULL');
    if (query.status === 'pending')
      builder.andWhere(
        'user.emailVerifiedAt IS NULL AND user.deactivatedAt IS NULL',
      );
    const [users, total] = await builder
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: users.map((user) => this.response(user)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async detail(id: string) {
    const user = await this.dataSource.manager.findOneBy(User, { id });
    if (!user) throw new NotFoundException('User not found');
    return this.response(user);
  }
  async setActive(actorId: string, id: string, isActive: boolean) {
    try {
      await this.dataSource.transaction(async (manager) => {
        // Serialize admin account changes, including two administrators disabling each other.
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext('users.administration'))`,
        );
        const actor = await manager.findOneBy(User, { id: actorId });
        if (!actor?.isActive || actor.role !== UserRole.ADMIN)
          throw new ForbiddenException('Administrator access is required');
        const user = await manager.findOne(User, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('User not found');
        if (!isActive && id === actorId)
          throw new ConflictException('You cannot deactivate your own account');
        if (
          !isActive &&
          user.role === UserRole.ADMIN &&
          user.isActive &&
          (await manager.countBy(User, {
            role: UserRole.ADMIN,
            isActive: true,
          })) <= 1
        )
          throw new ConflictException(
            'The last active administrator cannot be deactivated',
          );
        user.isActive = isActive && Boolean(user.emailVerifiedAt);
        user.deactivatedAt = isActive
          ? null
          : (user.deactivatedAt ?? new Date());
        await manager.save(User, user);
        if (!isActive) {
          await manager.delete(AuthSession, { userId: id });
          await manager.delete(AccountAction, { userId: id });
        }
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error({
        operation: 'users.active.failed',
        actorId,
        userId: id,
      });
      throw new InternalServerErrorException(
        'Unable to update this account. Please try again',
      );
    }
    this.logger.log({
      operation: 'users.active.changed',
      actorId,
      userId: id,
      isActive,
    });
    return this.detail(id);
  }
  private response(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      emailVerifiedAt: user.emailVerifiedAt,
      deactivatedAt: user.deactivatedAt,
      loyaltyBalance: user.loyaltyBalance,
      createdAt: user.createdAt,
    };
  }
}
