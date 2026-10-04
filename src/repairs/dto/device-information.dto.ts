import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class DeviceInformationDto {
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  deviceType: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  brand: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  model: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  purchaseDate?: string;
}
