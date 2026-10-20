import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { EmailService } from './email.service';

describe('Gmail EmailService', () => {
  const sendMail = jest.fn();
  const close = jest.fn();
  const fields = [
    'EMAIL_PROVIDER',
    'EMAIL_USER',
    'EMAIL_APP_PASSWORD',
    'EMAIL_FROM_NAME',
    'EMAIL_FROM_ADDRESS',
  ] as const;
  const original = Object.fromEntries(
    fields.map((field) => [field, process.env[field]]),
  );
  let email: EmailService;
  let factory: jest.SpyInstance;
  let warning: jest.SpyInstance;
  const request = {
    to: 'customer@example.com',
    subject: 'Welcome',
    text: 'Welcome',
    html: '<p>Welcome</p>',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_PROVIDER = 'gmail';
    process.env.EMAIL_USER = 'sender@gmail.com';
    process.env.EMAIL_APP_PASSWORD = 'super secret app password';
    process.env.EMAIL_FROM_NAME = 'Appliances.lk';
    delete process.env.EMAIL_FROM_ADDRESS;
    factory = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail, close } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    sendMail.mockResolvedValue({
      accepted: ['customer@example.com'],
      rejected: [],
    });
    email = new EmailService();
  });
  afterEach(() => {
    email.onModuleDestroy();
    jest.restoreAllMocks();
    for (const field of fields) {
      if (original[field] === undefined) delete process.env[field];
      else process.env[field] = original[field];
    }
  });
  it('reuses one Gmail transport, includes text/HTML and closes it on shutdown', async () => {
    expect((await email.send(request)).sent).toBe(true);
    await email.send(request);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmail',
        pool: true,
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { address: request.to, name: '' },
        from: { name: 'Appliances.lk', address: 'sender@gmail.com' },
        text: request.text,
        html: request.html,
      }),
    );
  });
  it('turns Gmail errors into safe results and never logs credentials or raw provider errors', async () => {
    sendMail.mockRejectedValue(
      Object.assign(
        new Error('password=super secret app password; confidential recipient'),
        { code: 'EAUTH' },
      ),
    );
    expect(await email.send(request)).toEqual({ sent: false, reason: 'EAUTH' });
    const logs = JSON.stringify(warning.mock.calls);
    expect(logs).toContain('EAUTH');
    for (const secret of [
      'super secret app password',
      'confidential recipient',
      'sender@gmail.com',
      request.html,
    ])
      expect(logs).not.toContain(secret);
  });
  it('forwards inline image buffers without enabling file or URL access', async () => {
    const attachment = {
      filename: 'logo.png',
      content: Buffer.from('image-bytes'),
      contentType: 'image/png',
      cid: 'brand@appliances.lk',
    };
    await email.send({ ...request, attachments: [attachment] });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [attachment] }),
    );
  });
  it('reports missing configuration without preventing the application from starting', async () => {
    delete process.env.EMAIL_APP_PASSWORD;
    expect(await email.send(request)).toEqual({
      sent: false,
      reason: 'invalid_configuration',
    });
    expect(factory).not.toHaveBeenCalled();
  });
  it('treats SMTP recipient rejection as a failure', async () => {
    sendMail.mockResolvedValue({ accepted: [], rejected: [request.to] });
    expect((await email.send(request)).sent).toBe(false);
  });
  it('rejects header injection and multiple arbitrary recipients', async () => {
    expect(
      (
        await email.send({
          ...request,
          subject: 'Welcome\r\nBcc: outsider@example.com',
        })
      ).sent,
    ).toBe(false);
    expect(
      (await email.send({ ...request, to: 'one@example.com,two@example.com' }))
        .sent,
    ).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
