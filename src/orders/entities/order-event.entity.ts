import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('order_events')
@Index('IDX_order_events_order_created', ['orderId', 'createdAt'])
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status_enum' })
  status: OrderStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
