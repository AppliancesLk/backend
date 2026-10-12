import type { RepairNotice } from '../../types/notification.types';
import { accountLink, emailLayout, statusLabel } from './email-layout';
export function repairRejectedTemplate(name: string, repair: RepairNotice) {
  // The current repair model has no persisted rejection-reason field.
  return emailLayout({
    subject: `Update regarding repair #${repair.reference}`,
    title: 'Repair request update',
    name,
    message:
      'Your repair request has not been approved. Please contact the store if you need more information.',
    rows: [
      ['Repair reference', repair.reference],
      ['Device', `${repair.device.brand} ${repair.device.model}`],
      ['Status', statusLabel(repair.status)],
    ],
    link: accountLink(`/repairs/${repair.id}`),
    buttonText: 'View your repair',
  });
}
