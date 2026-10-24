import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type AccountActionPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

@Entity('account_actions')
@Unique('UQ_account_actions_user_purpose', ['userId', 'purpose'])
export class AccountAction {
  @PrimaryColumn({ type: 'varchar', length: 64 }) tokenHash: string;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'varchar', length: 20 }) purpose: AccountActionPurpose;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
