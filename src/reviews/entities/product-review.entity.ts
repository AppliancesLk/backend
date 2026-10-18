import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
@Entity('product_reviews')
@Unique('UQ_product_reviews_customer', ['productId', 'customerId'])
@Index('IDX_product_reviews_created', ['productId', 'createdAt'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) productId: string;
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId', referencedColumnName: 'productID' })
  product: Product;
  @Column({ type: 'uuid' }) customerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: User;
  @Column({ type: 'integer' }) rating: number;
  @Column({ type: 'varchar', length: 120 }) title: string;
  @Column({ type: 'varchar', length: 3000 }) body: string;
  @Column({ default: false }) verifiedPurchase: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
