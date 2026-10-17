import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsObject,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { DeviceInformationDto } from './device-information.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRepairTicketDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => DeviceInformationDto)
  device: DeviceInformationDto;

  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  problemDescription: string;
}
