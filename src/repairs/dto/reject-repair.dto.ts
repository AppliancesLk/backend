import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RejectRepairDto {
  @IsUUID('4')
  id: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
