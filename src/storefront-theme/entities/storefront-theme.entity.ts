import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SeasonalTheme } from '../enums/seasonal-theme.enum';

@Entity('storefront_theme')
@Check('CHK_storefront_theme_singleton', 'id = 1')
export class StorefrontTheme {
  @PrimaryColumn({ type: 'integer', default: 1 }) id: number;
  @Column({ type: 'varchar', length: 20, default: SeasonalTheme.DEFAULT })
  theme: SeasonalTheme;
  @Column({ type: 'varchar', length: 80, default: '' }) headline: string;
  @Column({ type: 'varchar', length: 180, default: '' }) message: string;
  @Column({ default: true }) showGreeting: boolean;
  @Column({ default: true }) decorations: boolean;
  @Column({ default: true }) animations: boolean;
  @Column({ type: 'timestamptz', nullable: true }) startsAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) endsAt: Date | null;
  @Column({ type: 'integer', default: 0 }) version: number;
  @Column({ type: 'uuid', nullable: true }) updatedBy: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  editor: User | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
