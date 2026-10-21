// Local-only fixtures: no app startup, database access, or SMTP delivery.
const { mkdir, writeFile, readdir, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { OrderStatus } = require('../dist/orders/enums/order-status.enum');
const { PaymentStatus } = require('../dist/payments/enums/payment-status.enum');
const { RepairStatus } = require('../dist/repairs/enums/repair-status.enum');
const template = (file, name) =>
  require(`../dist/notification/email/templates/${file}.template`)[name];

(async () => {
  const output = resolve('.temp/email-previews');
  await mkdir(output, { recursive: true });
  const date = new Date('2026-10-20T04:30:00Z');
  const name = 'Lakshitha';
  // Use an existing public product upload for the local preview if available.
  // Data URIs are preview-only; actual email thumbnails use public http(s) URLs.
  const mediaDirectory = resolve(
    process.env.MEDIA_UPLOAD_DIR ?? 'uploads/media',
  );
  const files = await readdir(mediaDirectory).catch(() => []);
  const filename = files.find((file) =>
    /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(file),
  );
  const photo = filename
    ? `data:image/${filename.endsWith('.jpg') ? 'jpeg' : filename.split('.').pop()};base64,${(await readFile(resolve(mediaDirectory, filename))).toString('base64')}`
    : undefined;
  const photoUrl = 'https://images.example.com/preview-product.jpg';
  const order = {
    id: 'a1b2c3d4-5678-9012-3456-789012345678',
    status: OrderStatus.PENDING_PAYMENT,
    createdAt: date,
    total: '251980.00',
    delivery: {
      firstName: name,
      lastName: 'Madushan',
      addressLine1: '24 Temple Road',
      city: 'Colombo',
      postalCode: '00100',
      countryCode: 'LK',
    },
    items: [
      {
        name: 'Featured appliance',
        SKU: 'AP-001',
        images: [photoUrl],
        quantity: 1,
        unitPrice: '249990.00',
        lineTotal: '249990.00',
      },
      {
        name: 'Care accessory',
        SKU: 'AC-002',
        images: [],
        quantity: 1,
        unitPrice: '1990.00',
        lineTotal: '1990.00',
      },
    ],
  };
  const payment = {
    orderId: order.id,
    amount: order.total,
    payherePaymentId: 'PAY-10260824',
    status: PaymentStatus.SUCCESS,
  };
  const repair = {
    id: 'repair-preview',
    reference: 'RPR-20261020-ABCDEF12',
    device: { deviceType: 'Washing machine', brand: 'Samsung', model: 'WW80T' },
    problemDescription: 'The machine stops during the spin cycle.',
    status: RepairStatus.PENDING,
    createdAt: date,
    updatedAt: date,
  };
  const previews = [
    [
      'email-verification',
      template('account-action', 'accountActionTemplate')(
        name,
        'a'.repeat(64),
        'VERIFY_EMAIL',
      ),
    ],
    [
      'password-reset',
      template('account-action', 'accountActionTemplate')(
        name,
        'b'.repeat(64),
        'RESET_PASSWORD',
      ),
    ],
    ['welcome', template('welcome-email', 'welcomeEmailTemplate')(name)],
    [
      'login',
      template('login-notification', 'loginNotificationTemplate')(name, date),
    ],
    [
      'order-created',
      template('order-created', 'orderCreatedTemplate')(name, order),
    ],
    [
      'order-status',
      template('order-status-updated', 'orderStatusUpdatedTemplate')(
        name,
        { ...order, status: OrderStatus.SHIPPED },
        OrderStatus.PROCESSING,
      ),
    ],
    [
      'payment-success',
      template('payment-success', 'paymentSuccessTemplate')(name, payment),
    ],
    [
      'payment-failed',
      template('payment-failed', 'paymentFailedTemplate')(name, {
        ...payment,
        status: PaymentStatus.FAILED,
      }),
    ],
    [
      'repair-created',
      template('repair-request-created', 'repairRequestCreatedTemplate')(
        name,
        repair,
      ),
    ],
    [
      'repair-approved',
      template('repair-approved', 'repairApprovedTemplate')(name, {
        ...repair,
        status: RepairStatus.APPROVED,
      }),
    ],
    [
      'repair-rejected',
      template('repair-rejected', 'repairRejectedTemplate')(name, {
        ...repair,
        status: RepairStatus.REJECTED,
      }),
    ],
    [
      'repair-status',
      template('repair-status-updated', 'repairStatusUpdatedTemplate')(name, {
        ...repair,
        status: RepairStatus.IN_PROGRESS,
      }),
    ],
    [
      'repair-ready',
      template(
        'repair-ready-for-collection',
        'repairReadyForCollectionTemplate',
      )(name, { ...repair, status: RepairStatus.READY_FOR_COLLECTION }),
    ],
    [
      'promotion',
      template('promotion', 'promotionTemplate')(name, {
        title: 'Find your next upgrade',
        description: 'Explore the latest products in our store.',
        productName: 'Smartphones and accessories',
        link: 'https://appliances.example/products',
      }),
    ],
  ];
  for (const [file, content] of previews) {
    let html = content.html;
    for (const attachment of content.attachments ?? [])
      html = html.replaceAll(
        `cid:${attachment.cid}`,
        `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`,
      );
    if (photo) html = html.replaceAll(photoUrl, photo);
    await writeFile(resolve(output, `${file}.html`), html);
    await writeFile(resolve(output, `${file}.txt`), content.text);
  }
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email previews</title><body style="font:16px Arial;padding:24px;background:#F3F6F6;color:#162024"><h1>Appliances.lk email previews</h1><p>Sample data only. No emails were sent.</p><ul>${previews.map(([file]) => `<li style="margin:12px 0"><a href="${file}.html">${file}</a> · <a href="${file}.txt">Plain text</a></li>`).join('')}</ul></body></html>`,
  );
  console.log(
    `Rendered ${previews.length} email previews in ${output}. No emails sent.`,
  );
})().catch(() => {
  console.error(
    'Unable to generate email previews. Check the build and local output directory.',
  );
  process.exitCode = 1;
});
