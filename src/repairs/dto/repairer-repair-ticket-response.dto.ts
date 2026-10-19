import type { DeviceInformationDto } from './device-information.dto';
import type { RepairStatus } from '../enums/repair-status.enum';

export interface RepairerCustomerInfo {
  id: string;
  username: string;
  email: string;
}

export interface RepairerRepairTicketResponseDto {
  id: string;
  reference: string;
  customer: RepairerCustomerInfo;
  device: DeviceInformationDto;
  problemDescription: string;
  status: RepairStatus;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
