/**
 * Mock Providers for Unit and Integration Tests
 *
 * These mocks prevent tests from calling external services:
 * - Gmail/Email
 * - Google Gemini
 * - PayHere
 * - Azure Blob Storage
 */

import type { INestApplication } from '@nestjs/common';

/**
 * Email message captured by the mock
 */
export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: Date;
}

/**
 * Mock email service that captures all sent emails
 */
export class MockEmailService {
  private readonly messages: CapturedEmail[] = [];
  private sendBehavior: (message: CapturedEmail) => Promise<{ sent: boolean }> =
    async () => ({ sent: true });

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ sent: boolean }> {
    const captured: CapturedEmail = {
      ...message,
      sentAt: new Date(),
    };
    this.messages.push(captured);
    return this.sendBehavior(captured);
  }

  /**
   * Configure the mock to simulate email failures
   */
  configureSendFailure(): void {
    this.sendBehavior = async () => ({ sent: false });
  }

  /**
   * Reset to successful sending
   */
  configureSendSuccess(): void {
    this.sendBehavior = async () => ({ sent: true });
  }

  /**
   * Get all captured emails
   */
  getMessages(): CapturedEmail[] {
    return [...this.messages];
  }

  /**
   * Get emails sent to a specific address
   */
  getMessagesTo(email: string): CapturedEmail[] {
    return this.messages.filter(
      (m) => m.to.toLowerCase() === email.toLowerCase(),
    );
  }

  /**
   * Find the last verification email sent to an address
   */
  findVerificationEmail(email: string): CapturedEmail | undefined {
    return this.messages.findLast(
      (m) =>
        m.to.toLowerCase() === email.toLowerCase() &&
        m.subject.toLowerCase().includes('verify'),
    );
  }

  /**
   * Find the last password reset email sent to an address
   */
  findPasswordResetEmail(email: string): CapturedEmail | undefined {
    return this.messages.findLast(
      (m) =>
        m.to.toLowerCase() === email.toLowerCase() &&
        m.subject.toLowerCase().includes('password'),
    );
  }

  /**
   * Extract verification token from email text
   */
  extractToken(email: CapturedEmail): string | undefined {
    const match = email.text.match(/#token=([a-f0-9]{64})/);
    return match?.[1];
  }

  /**
   * Clear all captured messages
   */
  clear(): void {
    this.messages.length = 0;
    this.configureSendSuccess();
  }
}

/**
 * Mock Gemini AI service
 */
export class MockGeminiService {
  async generateContent(): Promise<{ text: string }> {
    return { text: 'Mock AI response for testing' };
  }

  async chat(): Promise<{ text: string }> {
    return { text: 'Mock chat response for testing' };
  }
}

/**
 * Mock PayHere payment service
 */
export class MockPayHereService {
  async createPayment(): Promise<{ paymentUrl: string; orderId: string }> {
    return {
      paymentUrl: 'https://sandbox.payhere.lk/mock',
      orderId: 'MOCK-ORDER-001',
    };
  }

  async verifyPayment(): Promise<{ verified: boolean; status: string }> {
    return { verified: true, status: 'SUCCESS' };
  }
}

/**
 * Mock Azure Blob Storage service
 */
export class MockBlobStorageService {
  private readonly blobs = new Map<string, Buffer>();

  async upload(
    containerName: string,
    blobName: string,
    data: Buffer,
  ): Promise<{ url: string }> {
    this.blobs.set(`${containerName}/${blobName}`, data);
    return { url: `https://mock-storage.blob.core.windows.net/${containerName}/${blobName}` };
  }

  async download(containerName: string, blobName: string): Promise<Buffer | null> {
    return this.blobs.get(`${containerName}/${blobName}`) ?? null;
  }

  async delete(containerName: string, blobName: string): Promise<void> {
    this.blobs.delete(`${containerName}/${blobName}`);
  }

  clear(): void {
    this.blobs.clear();
  }
}

/**
 * Global mock instances for shared state across tests
 */
export const mockEmail = new MockEmailService();
export const mockGemini = new MockGeminiService();
export const mockPayHere = new MockPayHereService();
export const mockBlobStorage = new MockBlobStorageService();

/**
 * Apply all mocks to a NestJS application
 */
export function applyMocksToApp(app: INestApplication): void {
  // EmailService mock - using dynamic import path from existing pattern
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EmailService } = require('../../src/notification/email/email.service');
    const emailService = app.get(EmailService);
    emailService.send = mockEmail.send.bind(mockEmail);
  } catch {
    // EmailService not available in this test context
  }
}

/**
 * Reset all mocks between tests
 */
export function resetAllMocks(): void {
  mockEmail.clear();
  mockBlobStorage.clear();
}
