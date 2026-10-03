import type { DeviceInformationDto } from './device-information.dto';
import type { RepairStatus } from '../enums/repair-status.enum';

export interface RepairTicketResponseDto {
  id: string;
  reference: string;
  customerId: string;
  assignedRepairerId: string | null;
  device: DeviceInformationDto;
  problemDescription: string;
  status: RepairStatus;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
