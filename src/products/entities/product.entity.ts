import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductBadge } from '../enums/product-badge.enum';

import { Category } from '../../categories/entities/category.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  productID: string;

  @Column()
  name: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Column({ type: 'text', array: true, default: '{}' }) features: string[];
  @Column({ type: 'text', array: true, default: '{}' }) boxContents: string[];
  @Column({ type: 'varchar', length: 300, default: '' }) warranty: string;
  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  ratingAverage: number;
  @Column({ type: 'integer', default: 0 }) ratingCount: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 160, default: '' })
  subtitle: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  badge: ProductBadge | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  compareAtPrice: number | null;

  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  createdAt: Date | null;

  @Column({ unique: true })
  SKU: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  price: number;

  @Column({ default: 0 })
  stockQty: number;

  @Column({
    type: 'text',
    array: true,
    default: '{}',
  })
  images: string[];

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  specifications: Record<string, unknown> | null;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Category, (category) => category.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryID' })
  category: Category;
}
