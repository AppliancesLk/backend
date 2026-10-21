import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';
import { formatMinorUnits, toMinorUnits } from '../../common/utils/money';
import {
  LoyaltyEntry,
  type LoyaltyKind,
} from '../entities/loyalty-entry.entity';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  constructor(private readonly dataSource: DataSource) {}

  async summary(userId: string) {
    const user = await this.dataSource.manager.findOne(User, {
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Account not found');
    const entries = await this.dataSource.manager.find(LoyaltyEntry, {
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 50,
    });
    return {
      balance: user.loyaltyBalance,
      currency: 'LKR' as const,
      ratePercent: '0.1',
      entries: entries.map(({ id, orderId, kind, amount, createdAt }) => ({
        id,
        orderId,
        kind,
        amount,
        createdAt,
      })),
    };
  }

  async redeem(manager: EntityManager, order: Order, amount: string) {
    const minor = toMinorUnits(amount);
    if (minor > toMinorUnits(order.subtotal))
      throw new ConflictException(
        'Loyalty credit cannot exceed the order subtotal',
      );
    if (minor === 0n) return;
    await this.change(manager, order, 'REDEEM', minor);
    order.loyaltyRedeemed = formatMinorUnits(minor);
    order.total = formatMinorUnits(toMinorUnits(order.subtotal) - minor);
  }

  async complete(manager: EntityManager, order: Order) {
    // 0.1% of the amount actually paid, rounded down to a cent. No rewards on redeemed credit.
    const reward = toMinorUnits(order.total) / 1000n;
    if (reward === 0n) return;
    await this.change(manager, order, 'EARN', reward);
    order.loyaltyEarned = formatMinorUnits(reward);
  }

  async refund(manager: EntityManager, order: Order) {
    const amount = toMinorUnits(order.loyaltyRedeemed ?? '0.00');
    if (amount > 0n) await this.change(manager, order, 'REFUND', amount);
  }

  private async change(
    manager: EntityManager,
    order: Order,
    kind: LoyaltyKind,
    amount: bigint,
  ) {
    const user = await manager.findOne(User, {
      where: { id: order.customerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException('Account not found');
    if (
      await manager.findOne(LoyaltyEntry, {
        where: { orderId: order.id, kind },
      })
    )
      return;
    const balance = toMinorUnits(user.loyaltyBalance);
    if (
      kind === 'REDEEM' &&
      (!user.isActive || !user.emailVerifiedAt || balance < amount)
    )
      throw new ConflictException(
        'Loyalty credit is unavailable or the balance has changed. Refresh checkout and try again',
      );
    user.loyaltyBalance = formatMinorUnits(
      kind === 'REDEEM' ? balance - amount : balance + amount,
    );
    await manager.save(User, user);
    await manager.save(
      LoyaltyEntry,
      manager.create(LoyaltyEntry, {
        userId: user.id,
        orderId: order.id,
        kind,
        amount: `${kind === 'REDEEM' ? '-' : ''}${formatMinorUnits(amount)}`,
      }),
    );
    this.logger.log({
      operation: 'loyalty.updated',
      userId: user.id,
      orderId: order.id,
      kind,
    });
  }
}
