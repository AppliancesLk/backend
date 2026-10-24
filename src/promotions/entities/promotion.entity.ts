import {
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
import type {
  PromotionContent,
  PromotionDeliveryStatus,
  PromotionRunStatus,
  PromotionSnapshot,
} from '../types/promotion.types';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'jsonb' }) content: PromotionContent;
  @Column({ default: 0 }) version: number;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator: User | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
@Entity('promotion_runs')
@Index(['campaignId', 'createdAt'])
export class PromotionRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) campaignId: string;
  @ManyToOne(() => Promotion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Promotion;
  @Column() campaignVersion: number;
  @Column({ type: 'varchar', length: 80, default: 'live' }) queueKey: string;
  @Column({ type: 'jsonb' }) snapshot: PromotionSnapshot;
  @Column() recipientCount: number;
  @Column({ type: 'varchar', length: 12, default: 'QUEUED' })
  status: PromotionRunStatus;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator: User | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
}
@Entity('promotion_recipients')
@Index(['runId', 'userId'], { unique: true })
@Index(['status', 'createdAt'])
export class PromotionRecipient {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) runId: string;
  @ManyToOne(() => PromotionRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: PromotionRun;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;
  @Column({ length: 255 }) username: string;
  @Column({ length: 320 }) email: string;
  @Column({ type: 'varchar', length: 12, default: 'QUEUED' })
  status: PromotionDeliveryStatus;
  @Column({ type: 'uuid', nullable: true }) notificationId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) claimedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
