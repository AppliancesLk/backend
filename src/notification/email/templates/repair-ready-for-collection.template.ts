import type { RepairNotice } from '../../types/notification.types';
import { accountLink, emailLayout } from './email-layout';
export function repairReadyForCollectionTemplate(
  name: string,
  repair: RepairNotice,
) {
  return emailLayout({
    subject: 'Your device is ready for collection',
    title: 'Ready for collection',
    name,
    message:
      'Your device is ready for collection. Please contact the store to arrange collection.',
    rows: [
      ['Repair reference', repair.reference],
      ['Device', `${repair.device.brand} ${repair.device.model}`],
      ['Status', 'Ready for collection'],
    ],
    link: accountLink(`/repairs/${repair.id}`),
    buttonText: 'View your repair',
  });
}
