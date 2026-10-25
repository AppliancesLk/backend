import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DeliveryInformationDto } from '../../checkout/dto/delivery-information.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { OrderEvent } from './order-event.entity';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';

@Entity('orders')
@Unique('UQ_orders_customer_key', ['customerId', 'idempotencyKey'])
@Index('IDX_orders_customer_created', ['customerId', 'createdAt'])
@Check('CHK_orders_nonnegative_totals', '"subtotal" >= 0 AND "total" >= 0')
@Check('CHK_orders_currency', `"currency" = 'LKR'`)
export class Order {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_orders' })
  id: string;
  @Column({ type: 'uuid' }) customerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'customerId',
    foreignKeyConstraintName: 'FK_orders_customer',
  })
  customer: User;

  @Column({ type: 'uuid', select: false }) idempotencyKey: string;
  @Column({ type: 'varchar', length: 64, select: false }) requestHash: string;
  // Historical source ID; the order must outlive changes to the live cart.
  @Column({ type: 'uuid' }) sourceCartId: string;
  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;
  @Column({ type: 'varchar', length: 3, default: 'LKR' }) currency: string;
  @Column({ type: 'numeric', precision: 30, scale: 2 }) subtotal: string;
  @Column({ type: 'numeric', precision: 30, scale: 2 }) total: string;
  @Column({ type: 'varchar', length: 24, default: PaymentMethod.PAYHERE })
  paymentMethod: PaymentMethod;
  @Column({ type: 'numeric', precision: 30, scale: 2, default: '0.00' })
  loyaltyRedeemed: string;
  @Column({ type: 'numeric', precision: 30, scale: 2, default: '0.00' })
  loyaltyEarned: string;
  @Column({ default: false }) stockReserved: boolean;
  @Column({ type: 'jsonb' }) delivery: DeliveryInformationDto;
  @Column({ type: 'timestamptz' }) preparedAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @OneToMany(() => OrderItem, (item) => item.order) items: OrderItem[];
  @OneToMany(() => OrderEvent, (event) => event.order) events: OrderEvent[];
}
