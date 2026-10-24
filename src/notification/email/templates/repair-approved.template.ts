import type { RepairNotice } from '../../types/notification.types';
import { accountLink, emailLayout, statusLabel } from './email-layout';
export function repairApprovedTemplate(name: string, repair: RepairNotice) {
  return emailLayout({
    subject: `Your repair #${repair.reference} has been approved`,
    title: 'Repair request approved',
    name,
    message:
      'Your repair request has been approved. Check your repair page for further progress updates.',
    rows: [
      ['Repair reference', repair.reference],
      ['Device', `${repair.device.brand} ${repair.device.model}`],
      ['Status', statusLabel(repair.status)],
    ],
    link: accountLink(`/repairs/${repair.id}`),
    buttonText: 'View your repair',
  });
}
