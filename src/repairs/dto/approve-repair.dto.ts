import { IsUUID } from 'class-validator';

export class ApproveRepairDto {
  @IsUUID('4')
  id: string;
}
