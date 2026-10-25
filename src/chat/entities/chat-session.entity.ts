import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { ChatStatus } from '../types/chat.types';
@Entity('chat_sessions')
@Index('IDX_chat_sessions_customer_created', ['customerId', 'createdAt'])
@Index('IDX_chat_sessions_status_activity', ['status', 'lastMessageAt'])
@Check('CHK_chat_sessions_status', `status IN ('OPEN','CLOSED')`)
@Check(
  'CHK_chat_sessions_count',
  '"messageCount" BETWEEN 0 AND 100 AND "customerUnreadCount" BETWEEN 0 AND 100 AND "adminUnreadCount" BETWEEN 0 AND 100',
)
export class ChatSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) customerId: string;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;
  @Column({ type: 'varchar', length: 6, default: 'OPEN' }) status: ChatStatus;
  @Column({ type: 'integer', default: 0 }) messageCount: number;
  @Column({ type: 'integer', default: 0 }) customerUnreadCount: number;
  @Column({ type: 'integer', default: 0 }) adminUnreadCount: number;
  @Column({ type: 'varchar', length: 120, default: '' })
  lastMessagePreview: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) lastMessageAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) closedAt: Date | null;
}
