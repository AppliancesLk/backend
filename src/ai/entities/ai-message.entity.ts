import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

export type AiMessageRole = 'USER' | 'ASSISTANT';
@Entity('ai_messages')
@Check('CHK_ai_messages_role', `"role" IN ('USER', 'ASSISTANT')`)
@Check('CHK_ai_messages_content', 'char_length(content) BETWEEN 1 AND 8000')
@Index('IDX_ai_messages_conversation_created', ['conversationId', 'createdAt'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) conversationId: string;
  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'conversationId' })
  conversation: AiConversation;
  @Column({ type: 'varchar', length: 9 }) role: AiMessageRole;
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
