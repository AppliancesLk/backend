import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  imageID: string;

  @Column({ type: 'uuid' })
  productID: string;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productID', referencedColumnName: 'productID' })
  product: Product;

  @Column({ type: 'varchar', length: 512, unique: true })
  blobName: string;

  @Column({ type: 'varchar', length: 100 })
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';

  @Column({ type: 'integer' })
  sizeBytes: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
