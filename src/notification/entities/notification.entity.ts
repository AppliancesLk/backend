import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NOTIFICATION_TYPES } from '../types/notification.types';
import type {
  NotificationStatus,
  NotificationType,
  RelatedEntityType,
} from '../types/notification.types';

@Entity('notifications')
@Unique('UQ_notifications_event_key', ['eventKey'])
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Check('CHK_notifications_status', `status IN ('PENDING','SENT','FAILED')`)
@Check('CHK_notifications_channel', `channel = 'EMAIL'`)
@Check(
  'CHK_notifications_type',
  `type IN (${NOTIFICATION_TYPES.map((type) => `'${type}'`).join(',')})`,
)
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'varchar', length: 40 }) type: NotificationType;
  @Column({ type: 'varchar', length: 10, default: 'EMAIL' }) channel: 'EMAIL';
  @Column({ type: 'varchar', length: 320 }) recipient: string;
  @Column({ type: 'varchar', length: 300 }) subject: string;
  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: NotificationStatus;
  @Column({ type: 'varchar', length: 300 }) eventKey: string;
  @Column({ type: 'varchar', length: 10, nullable: true })
  relatedEntityType: RelatedEntityType | null;
  @Column({ type: 'uuid', nullable: true }) relatedEntityId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) failedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
