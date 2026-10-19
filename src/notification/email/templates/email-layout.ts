import type { EmailContent } from '../email.types';
import { OrderStatus } from '../../../orders/enums/order-status.enum';
import { RepairStatus } from '../../../repairs/enums/repair-status.enum';

export function escapeHtml(
  value: string | number | boolean | null | undefined,
): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}
export function formatEmailDate(date: Date): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Colombo',
    }).format(date) + ' (Sri Lanka time)'
  );
}
export function statusLabel(status: OrderStatus | RepairStatus): string {
  return status.toLowerCase().replaceAll('_', ' ');
}
export function safeEmailLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function accountLink(path: string): string | undefined {
  const origin = safeEmailLink(
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
  );
  return origin ? new URL(path, origin).href : undefined;
}
export function emailLayout(input: {
  subject: string;
  title: string;
  name: string;
  message: string;
  rows?: [string, string][];
  paragraphs?: string[];
  link?: string;
  buttonText?: string;
}): EmailContent {
  const rows = input.rows ?? [],
    paragraphs = input.paragraphs ?? [],
    link = safeEmailLink(input.link);
  const subject = input.subject.replace(/[\r\n]/g, ' ').slice(0, 300);
  const action = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px">${escapeHtml(input.buttonText ?? 'View details')}</a></p>`
    : '';
  return {
    subject,
    text: [
      'Appliances.lk',
      input.title,
      `Hello ${input.name},`,
      input.message,
      ...rows.map(([label, value]) => `${label}: ${value}`),
      ...paragraphs,
      ...(link ? [link] : []),
      'Appliances.lk — Thank you for choosing us.',
    ].join('\n\n'),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0"><tr><td style="padding:24px;background:#2563eb;color:#ffffff;font-size:22px;font-weight:bold">Appliances.lk</td></tr><tr><td style="padding:24px;line-height:1.6;overflow-wrap:anywhere"><h1 style="font-size:24px;line-height:1.3;margin:0 0 20px">${escapeHtml(input.title)}</h1><p>Hello ${escapeHtml(input.name)},</p><p>${escapeHtml(input.message)}</p><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><th scope="row" align="left" valign="top" style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;width:35%">${escapeHtml(label)}</th><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;white-space:pre-line">${escapeHtml(value)}</td></tr>`).join('')}</table>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${action}</td></tr><tr><td style="padding:20px 24px;background:#f1f5f9;color:#64748b;font-size:12px">Appliances.lk<br>Thank you for choosing us.</td></tr></table></td></tr></table></body></html>`,
  };
}
