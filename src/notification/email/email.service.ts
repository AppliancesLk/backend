import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { isEmail } from 'class-validator';
import type { EmailRequest, EmailResult } from './email.types';

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter;
  private from?: { name: string; address: string };

  async send(input: EmailRequest): Promise<EmailResult> {
    const started = Date.now();
    try {
      if (!isEmail(input.to) || /[\r\n]/.test(input.subject))
        return this.failed('invalid_message', started);
      if (!this.transporter) {
        const user = process.env.EMAIL_USER?.trim();
        const pass = process.env.EMAIL_APP_PASSWORD?.replace(/\s/g, '');
        const address = process.env.EMAIL_FROM_ADDRESS?.trim() || user;
        const name = process.env.EMAIL_FROM_NAME?.trim() || 'Appliances.lk';
        if (
          (process.env.EMAIL_PROVIDER ?? 'gmail') !== 'gmail' ||
          !user ||
          !isEmail(user) ||
          !pass ||
          !address ||
          !isEmail(address) ||
          /[\r\n]/.test(name)
        )
          return this.failed('invalid_configuration', started);
        this.from = { name, address };
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          pool: true,
          maxConnections: 2,
          maxMessages: 50,
          auth: { user, pass },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          dnsTimeout: 10000,
          logger: false,
          debug: false,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
      }
      const result: { accepted?: unknown[]; rejected?: unknown[] } =
        await this.transporter.sendMail({
          from: this.from,
          to: { address: input.to, name: '' },
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
      if (!result.accepted?.length || result.rejected?.length)
        return this.failed('recipient_rejected', started);
      this.logger.log({
        operation: 'email.sent',
        durationMs: Date.now() - started,
      });
      return { sent: true };
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      const reason =
        typeof code === 'string' &&
        [
          'EAUTH',
          'ECONNECTION',
          'ETIMEDOUT',
          'ESOCKET',
          'EENVELOPE',
          'EMESSAGE',
          'EDNS',
        ].includes(code)
          ? code
          : 'smtp_error';
      return this.failed(reason, started);
    }
  }
  private failed(reason: string, started: number): EmailResult {
    // Never log raw SMTP errors: their response/configuration can contain credentials.
    this.logger.warn({
      operation: 'email.failed',
      reason,
      durationMs: Date.now() - started,
    });
    return { sent: false, reason };
  }
  onModuleDestroy() {
    this.transporter?.close();
  }
}
