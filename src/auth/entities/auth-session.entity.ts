import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryColumn() tokenHash: string;
  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'auth_sessions_userId_fkey',
  })
  user: User;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
}
