import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';
import { User } from '../../users/entities/user.entity';
import type { ChatRole } from '../types/chat.types';
@Entity('chat_messages')
@Unique('UQ_chat_messages_request', [
  'chatSessionId',
  'senderUserId',
  'clientMessageId',
])
@Unique('UQ_chat_messages_sequence', ['chatSessionId', 'sequence'])
@Check('CHK_chat_messages_sequence', 'sequence BETWEEN 1 AND 100')
@Check('CHK_chat_messages_role', `"senderRole" IN ('CUSTOMER','ADMIN')`)
@Check(
  'CHK_chat_messages_content',
  'char_length(btrim(content)) BETWEEN 1 AND 2000',
)
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) chatSessionId: string;
  @ManyToOne(() => ChatSession, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatSessionId' })
  chatSession: ChatSession;
  @Column({ type: 'uuid' }) senderUserId: string;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderUserId' })
  sender: User;
  @Column({ type: 'varchar', length: 8 }) senderRole: ChatRole;
  @Column({ type: 'uuid' }) clientMessageId: string;
  @Column({ type: 'integer' }) sequence: number;
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
