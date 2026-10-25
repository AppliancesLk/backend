import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

export type LoyaltyKind = 'EARN' | 'REDEEM' | 'REFUND';
@Entity('loyalty_entries')
@Unique('UQ_loyalty_order_kind', ['orderId', 'kind'])
@Index('IDX_loyalty_user_created', ['userId', 'createdAt'])
export class LoyaltyEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column({ type: 'varchar', length: 10 }) kind: LoyaltyKind;
  @Column({ type: 'numeric', precision: 30, scale: 2 }) amount: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
