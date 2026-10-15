export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}
export interface EmailRequest extends EmailContent {
  to: string;
}
export interface EmailResult {
  sent: boolean;
  reason?: string;
}
