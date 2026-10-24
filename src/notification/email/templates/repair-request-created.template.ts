import type { RepairNotice } from '../../types/notification.types';
import {
  accountLink,
  emailLayout,
  formatEmailDate,
  statusLabel,
} from './email-layout';
export function repairRequestCreatedTemplate(
  name: string,
  repair: RepairNotice,
) {
  return emailLayout({
    subject: `Repair request #${repair.reference} received`,
    title: 'Repair request received',
    name,
    message: 'We have received your repair request. It is awaiting review.',
    rows: [
      ['Repair reference', repair.reference],
      [
        'Device',
        `${repair.device.deviceType} — ${repair.device.brand} ${repair.device.model}`,
      ],
      ['Problem summary', repair.problemDescription],
      ['Submitted', formatEmailDate(repair.createdAt)],
      ['Status', statusLabel(repair.status)],
    ],
    link: accountLink(`/repairs/${repair.id}`),
    buttonText: 'View your repair',
  });
}
