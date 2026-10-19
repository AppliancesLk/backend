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
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { DeviceInformationDto } from '../dto/device-information.dto';
import { RepairStatus } from '../enums/repair-status.enum';

@Entity('repair_tickets')
@Unique('UQ_repair_tickets_reference', ['reference'])
@Index('IDX_repair_tickets_customer_created', ['customerId', 'createdAt'])
@Index('IDX_repair_tickets_status_created', ['status', 'createdAt'])
@Check(
  'CHK_repair_tickets_reference',
  `"reference" ~ '^RPR-[0-9]{8}-[A-F0-9]{8}$'`,
)
@Check('CHK_repair_tickets_device_object', `jsonb_typeof("device") = 'object'`)
@Check(
  'CHK_repair_tickets_problem_length',
  'char_length("problemDescription") BETWEEN 10 AND 2000',
)
export class RepairTicket {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_repair_tickets',
  })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  reference: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'customerId',
    foreignKeyConstraintName: 'FK_repair_tickets_customer',
  })
  customer: User;

  @Column({ type: 'uuid', nullable: true })
  assignedRepairerId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'assignedRepairerId',
    foreignKeyConstraintName: 'FK_repair_tickets_repairer',
  })
  assignedRepairer: User | null;

  @Column({ type: 'jsonb' })
  device: DeviceInformationDto;

  @Column({ type: 'text' })
  problemDescription: string;

  @Column({
    type: 'enum',
    enum: RepairStatus,
    enumName: 'repair_status_enum',
    default: RepairStatus.PENDING,
  })
  status: RepairStatus;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
