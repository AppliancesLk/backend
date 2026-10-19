import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('carts')
@Unique('UQ_carts_user', ['userId'])
export class Cart {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_carts' })
  id: string;

  @Column({ type: 'uuid' }) userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_carts_user' })
  user: User;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
