import { IsEnum, IsNotEmpty } from 'class-validator';
import { RepairStatus } from '../enums/repair-status.enum';

export class UpdateRepairStatusDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(RepairStatus, {
    message: 'Status must be a valid repair status',
  })
  status: RepairStatus;
}
