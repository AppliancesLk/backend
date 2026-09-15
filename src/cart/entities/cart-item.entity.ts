import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Unique('UQ_cart_items_cart_product', ['cartId', 'productId'])
@Check('CHK_cart_items_positive_quantity', '"quantity" > 0')
export class CartItem {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cart_items' })
  id: string;
  @Column({ type: 'uuid' }) cartId: string;
  @ManyToOne(() => Cart, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'cartId',
    foreignKeyConstraintName: 'FK_cart_items_cart',
  })
  cart: Cart;

  @Index('IDX_cart_items_product')
  @Column({ type: 'uuid' })
  productId: string;
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'productId',
    referencedColumnName: 'productID',
    foreignKeyConstraintName: 'FK_cart_items_product',
  })
  product: Product;

  @Column({ type: 'integer' }) quantity: number;
  @CreateDateColumn() createdAt: Date;
}
