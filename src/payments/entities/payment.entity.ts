import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity('payments')
@Unique('UQ_payments_order', ['orderId'])
@Index('IDX_payments_customer_created', ['customerId', 'createdAt'])
@Index('UQ_payments_payhere_id', ['payherePaymentId'], {
  unique: true,
  where: '"payherePaymentId" IS NOT NULL',
})
@Check('CHK_payments_positive_amount', '"amount" > 0')
@Check('CHK_payments_currency', `"currency" = 'LKR'`)
export class Payment {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_payments' })
  id: string;

  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_payments_order',
  })
  order: Order;

  @Column({ type: 'uuid' }) customerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'customerId',
    foreignKeyConstraintName: 'FK_payments_customer',
  })
  customer: User;

  @Column({ type: 'varchar', nullable: true }) payherePaymentId: string | null;
  @Column({ type: 'numeric', precision: 30, scale: 2 }) amount: string;
  @Column({ type: 'varchar', length: 3, default: 'LKR' }) currency: string;
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;
  @Column({ type: 'varchar', length: 3, nullable: true })
  providerStatusCode: string | null;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
