import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Order } from './order.entity';

@Entity('order_items')
@Unique('UQ_order_items_order_product', ['orderId', 'productId'])
@Index('IDX_order_items_product', ['productId'])
@Check('CHK_order_items_positive_quantity', '"quantity" > 0')
@Check(
  'CHK_order_items_amounts',
  '"unitPrice" >= 0 AND "lineTotal" = "unitPrice" * "quantity"',
)
export class OrderItem {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_order_items',
  })
  id: string;
  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_order_items_order',
  })
  order: Order;
  @Column({ type: 'uuid' }) productId: string;
  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'productId',
    referencedColumnName: 'productID',
    foreignKeyConstraintName: 'FK_order_items_product',
  })
  product: Product;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar' }) SKU: string;
  @Column({ type: 'text', array: true, default: '{}' }) images: string[];
  @Column({ type: 'integer' }) quantity: number;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) unitPrice: string;
  @Column({ type: 'numeric', precision: 30, scale: 2 }) lineTotal: string;
}
