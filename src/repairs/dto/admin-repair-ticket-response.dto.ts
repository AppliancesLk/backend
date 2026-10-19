import type { DeviceInformationDto } from './device-information.dto';
import type { RepairStatus } from '../enums/repair-status.enum';

export interface CustomerInfo {
  id: string;
  username: string;
  email: string;
}

export interface AdminRepairTicketResponseDto {
  id: string;
  reference: string;
  customer: CustomerInfo;
  assignedRepairerId: string | null;
  device: DeviceInformationDto;
  problemDescription: string;
  status: RepairStatus;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
