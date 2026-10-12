import { RepairStatus } from '../../../repairs/enums/repair-status.enum';
import type { RepairNotice } from '../../types/notification.types';
import { accountLink, emailLayout, statusLabel } from './email-layout';
const messages: Record<RepairStatus, string> = {
  PENDING: 'Your repair is awaiting review.',
  APPROVED: 'Your repair has been approved.',
  REJECTED: 'Your repair request has not been approved.',
  ASSIGNED: 'Your repair has been assigned to a repairer.',
  IN_PROGRESS: 'Work on your device is in progress.',
  AWAITING_PARTS: 'Your repair is awaiting parts.',
  READY_FOR_COLLECTION: 'Your device is ready for collection.',
  COMPLETED: 'Your repair has been marked as completed.',
  CANCELLED: 'Your repair has been cancelled.',
};
export function repairStatusUpdatedTemplate(
  name: string,
  repair: RepairNotice,
) {
  return emailLayout({
    subject: `Repair #${repair.reference} is now ${statusLabel(repair.status)}`,
    title: 'Repair status updated',
    name,
    message: messages[repair.status],
    rows: [
      ['Repair reference', repair.reference],
      ['Device', `${repair.device.brand} ${repair.device.model}`],
      ['New status', statusLabel(repair.status)],
    ],
    link: accountLink(`/repairs/${repair.id}`),
    buttonText: 'View your repair',
  });
}
