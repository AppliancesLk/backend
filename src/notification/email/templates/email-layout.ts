import type { EmailContent } from '../email.types';
import { OrderStatus } from '../../../orders/enums/order-status.enum';
import { RepairStatus } from '../../../repairs/enums/repair-status.enum';
import type { OrderItem } from '../../../orders/entities/order-item.entity';
import { formatMinorUnits, toMinorUnits } from '../../../common/utils/money';
import { EMAIL_BRAND_CID, EMAIL_BRAND_PNG } from '../email-brand';

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
      hour12: true,
    })
      .format(date)
      .replace(/\b(am|pm)\b/g, (period) => period.toUpperCase()) +
    ' (Sri Lanka time)'
  );
}
export function statusLabel(status: OrderStatus | RepairStatus): string {
  const label = status.toLowerCase().replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
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

export function orderReference(id: string): string {
  return `Order #${id.slice(0, 8).toUpperCase()}`;
}

export function formatEmailMoney(value: string): string {
  const [whole, fraction] = formatMinorUnits(toMinorUnits(value)).split('.');
  return `LKR ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

// Email clients cannot resolve relative upload paths against the API themselves.
// Never fetch remote product images on the backend; the mail client loads them.
export function emailImageUrl(value: string): string | undefined {
  if (/[\s\\]/.test(value)) return undefined;
  if (!value.startsWith('/')) return safeEmailLink(value);
  if (value.startsWith('//')) return undefined;
  const base = safeEmailLink(process.env.EMAIL_ASSET_BASE_URL);
  return base ? new URL(value, base).href : undefined;
}

type EmailOrderItem = Pick<
  OrderItem,
  'name' | 'SKU' | 'images' | 'quantity' | 'unitPrice' | 'lineTotal'
>;

const bodyFont = "'Instrument Sans',Arial,Helvetica,sans-serif";
const displayFont = "'Bricolage Grotesque',Arial,Helvetica,sans-serif";
const colors = {
  primary: '#0A6B70',
  accent: '#F5A524',
  text: '#162024',
  secondary: '#4D5B60',
  muted: '#66767B',
  page: '#F3F6F6',
  border: '#D3DADC',
  subtleBorder: '#E7EBEC',
};

function renderItems(items: EmailOrderItem[]): string {
  if (!items.length) return '';
  return `<h2 style="font-family:${displayFont};font-size:20px;line-height:28px;margin:28px 0 8px;color:${colors.text}">Your items</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${items
      .map((item) => {
        const image = (item.images ?? []).map(emailImageUrl).find(Boolean);
        return `<tr>
        <td width="84" valign="top" style="padding:16px 12px 16px 0;border-bottom:1px solid ${colors.subtleBorder}">
          <table role="presentation" width="72" height="72" cellpadding="0" cellspacing="0" style="background:${colors.page};border:1px solid ${colors.subtleBorder};border-radius:8px"><tr><td align="center" valign="middle" style="font-size:11px;color:${colors.muted}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" width="70" height="70" style="display:block;width:70px;height:70px;object-fit:contain;border:0;border-radius:7px;font-size:10px;color:${colors.muted}">` : 'No image'}</td></tr></table>
        </td>
        <td valign="top" style="padding:16px 0;border-bottom:1px solid ${colors.subtleBorder};overflow-wrap:anywhere;word-break:break-word">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${colors.text}">${escapeHtml(item.name)}</p>
          ${item.SKU ? `<p style="margin:0 0 6px;font-size:12px;color:${colors.muted}">SKU: ${escapeHtml(item.SKU)}</p>` : ''}
          <p style="margin:0 0 6px;font-size:13px;color:${colors.secondary}">Qty ${escapeHtml(item.quantity)} &times; ${escapeHtml(formatEmailMoney(item.unitPrice))}</p>
          <p style="margin:0;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:${colors.text}">${escapeHtml(formatEmailMoney(item.lineTotal))}</p>
        </td>
      </tr>`;
      })
      .join('')}</table>`;
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
  reference?: { value: string; detail: string };
  items?: EmailOrderItem[];
  total?: string;
}): EmailContent {
  const rows = input.rows ?? [];
  const paragraphs = input.paragraphs ?? [];
  const items = input.items ?? [];
  const link = safeEmailLink(input.link);
  const subject = input.subject.replace(/[\r\n]/g, ' ').slice(0, 300);
  const action = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" class="email-action" style="margin:28px 0 0"><tr><td align="center" bgcolor="${colors.primary}" style="border-radius:8px;mso-padding-alt:14px 24px"><a href="${escapeHtml(link)}" style="display:block;padding:14px 24px;border:1px solid ${colors.primary};border-radius:8px;background:${colors.primary};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;mso-padding-alt:0">${escapeHtml(input.buttonText ?? 'View details')}</a></td></tr></table><p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${colors.muted}">If the button does not open, use this link:<br><a href="${escapeHtml(link)}" style="color:${colors.primary};text-decoration:underline;word-break:break-all">${escapeHtml(link)}</a></p>`
    : '';
  const details = rows.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid ${colors.border};border-radius:8px;background:${colors.page};table-layout:fixed">${rows.map(([label, value], index) => `<tr><th scope="row" align="left" valign="top" style="width:35%;padding:12px;font-size:13px;line-height:20px;font-weight:500;color:${colors.secondary};${index ? `border-top:1px solid ${colors.border};` : ''}overflow-wrap:anywhere">${escapeHtml(label)}</th><td valign="top" style="padding:12px;font-size:14px;line-height:20px;color:${colors.text};white-space:pre-line;overflow-wrap:anywhere;word-break:break-word;${index ? `border-top:1px solid ${colors.border};` : ''}">${escapeHtml(value)}</td></tr>`).join('')}</table>`
    : '';
  return {
    subject,
    attachments: [
      {
        filename: 'appliances-mark.png',
        content: Buffer.from(EMAIL_BRAND_PNG, 'base64'),
        contentType: 'image/png',
        cid: EMAIL_BRAND_CID,
      },
    ],
    text: [
      'Appliances.lk',
      input.title,
      `Hello ${input.name},`,
      input.message,
      ...(input.reference
        ? [
            input.reference.value,
            `Full order reference: ${input.reference.detail}`,
          ]
        : []),
      ...rows.map(([label, value]) => `${label}: ${value}`),
      ...items.map(
        (item) =>
          `${item.name}${item.SKU ? ` (SKU: ${item.SKU})` : ''}\nQty ${item.quantity} × ${formatEmailMoney(item.unitPrice)} = ${formatEmailMoney(item.lineTotal)}`,
      ),
      ...(input.total ? [`Order total: ${formatEmailMoney(input.total)}`] : []),
      ...paragraphs,
      ...(link ? [`${input.buttonText ?? 'View details'}: ${link}`] : []),
      'Appliances.lk — Thank you for choosing us.',
    ].join('\n\n'),
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:16px 8px!important}.email-padding{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:26px!important;line-height:32px!important}.email-action{width:100%!important}.email-total-label,.email-total-value{display:block!important;width:auto!important;text-align:left!important}.email-total-label{padding:16px 16px 0!important}.email-total-value{padding:4px 16px 16px!important}}</style></head>
<body style="margin:0;padding:0;background:${colors.page};font-family:${bodyFont};color:${colors.text};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;color:${colors.page};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(input.message)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.page}"><tr><td class="email-outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid ${colors.border};border-top:4px solid ${colors.primary};border-radius:12px;table-layout:fixed">
<tr><td class="email-padding" style="padding:28px 32px;border-bottom:1px solid ${colors.subtleBorder}"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="48" valign="middle"><img src="cid:${EMAIL_BRAND_CID}" alt="" width="40" height="40" style="display:block;border:0"></td><td valign="middle" style="font-family:${displayFont};font-size:26px;line-height:34px;letter-spacing:-1px;font-weight:700;color:${colors.text}"><span role="img" aria-label="Appliances.lk">Appliances<span style="color:${colors.primary}">.lk</span></span></td></tr></table></td></tr>
<tr><td class="email-padding" style="padding:32px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">
<h1 class="email-title" style="font-family:${displayFont};font-size:32px;line-height:38px;letter-spacing:-0.7px;font-weight:700;margin:0 0 24px;color:${colors.text}">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(input.name)},</p>
<p style="margin:0;font-size:16px;color:${colors.secondary}">${escapeHtml(input.message)}</p>
${input.reference ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #8A989C;border-radius:8px;background:${colors.page};table-layout:fixed"><tr><td style="padding:16px;border-left:3px solid ${colors.accent};border-radius:8px"><p style="margin:0 0 4px;font-family:${displayFont};font-size:20px;font-weight:600;color:${colors.text}">${escapeHtml(input.reference.value)}</p><p style="margin:0;font-size:12px;color:${colors.muted};word-break:break-all">Full reference: ${escapeHtml(input.reference.detail)}</p></td></tr></table>` : ''}
${details}${renderItems(items)}
${input.total ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#E8F6F5;border-radius:8px;table-layout:fixed"><tr><td class="email-total-label" style="padding:16px;font-size:14px;font-weight:600;color:${colors.primary};width:30%">Order total</td><td class="email-total-value" align="right" style="padding:16px;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;color:${colors.text};overflow-wrap:anywhere">${escapeHtml(formatEmailMoney(input.total))}</td></tr></table>` : ''}
${paragraphs.map((paragraph) => `<p style="margin:24px 0 0;font-size:14px;color:${colors.secondary}">${escapeHtml(paragraph)}</p>`).join('')}${action}
</td></tr>
<tr><td class="email-padding" style="padding:24px 32px;background:${colors.text};border-radius:0 0 10px 10px"><p style="margin:0 0 6px;font-family:${displayFont};font-size:18px;font-weight:600;color:#E9EEEF">Appliances<span style="color:#5EC0BB">.lk</span></p><p style="margin:0;font-size:13px;line-height:20px;color:#B3BEC1">Thank you for choosing us.</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  };
}
