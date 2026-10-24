import { IsUUID } from 'class-validator';

export class AssignRepairDto {
  @IsUUID('4')
  repairerId: string;
}
