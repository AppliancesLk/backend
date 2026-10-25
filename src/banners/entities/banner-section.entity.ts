import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const BANNER_POSITIONS = [
  'top',
  'middle',
  'bottom-one',
  'bottom-two',
] as const;
export type BannerPosition = (typeof BANNER_POSITIONS)[number];
export interface BannerSlide {
  imageUrl: string;
  alt: string;
  title: string;
  description: string;
  buttonText: string;
  href: string;
}

@Entity('banner_sections')
export class BannerSection {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  position: BannerPosition;

  @Column({ default: false })
  visible: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  slides: BannerSlide[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
