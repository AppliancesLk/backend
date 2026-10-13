import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  categoryID: string;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(
    () => Category,
    (category) => category.children,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'parentID' })
  parent: Category | null;

  @OneToMany(
    () => Category,
    (category) => category.parent,
  )
  children: Category[];

  @OneToMany(
    () => Product,
    (product) => product.category,
  )
  products: Product[];
}