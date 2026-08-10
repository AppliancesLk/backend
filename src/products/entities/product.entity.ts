import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Category } from '../../categories/entities/category.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  productID: string;

  @Column()
  name: string;

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

  @ManyToOne(
    () => Category,
    (category) => category.products,
    {
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'categoryID' })
  category: Category;
}