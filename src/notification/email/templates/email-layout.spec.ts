import { Order } from '../../../orders/entities/order.entity';
import { OrderStatus } from '../../../orders/enums/order-status.enum';
import { orderCreatedTemplate } from './order-created.template';
import { EMAIL_BRAND_CID } from '../email-brand';
import {
  emailImageUrl,
  emailLayout,
  formatEmailDate,
  formatEmailMoney,
  orderReference,
} from './email-layout';

describe('Branded notification email', () => {
  const originalBase = process.env.EMAIL_ASSET_BASE_URL;
  afterEach(() => {
    if (originalBase === undefined) delete process.env.EMAIL_ASSET_BASE_URL;
    else process.env.EMAIL_ASSET_BASE_URL = originalBase;
  });

  it('includes a CID PNG logo, accessible copy and the Lagoon and Saffron palette', () => {
    const content = emailLayout({
      subject: 'Account update',
      title: 'Welcome back',
      name: 'Buyer <script>',
      message: 'Your account is ready.',
      link: 'https://shop.example.com/profile',
      buttonText: 'View your profile',
    });
    expect(content.html).toContain('#0A6B70');
    expect(content.html).toContain('#162024');
    expect(content.html).toContain(`src="cid:${EMAIL_BRAND_CID}"`);
    expect(content.attachments?.[0]).toMatchObject({
      cid: EMAIL_BRAND_CID,
      contentType: 'image/png',
    });
    expect(content.attachments?.[0].content.subarray(1, 4).toString()).toBe(
      'PNG',
    );
    expect(content.html).toContain('Buyer &lt;script&gt;');
    expect(content.html).not.toContain('<script>');
    expect(content.text).toContain(
      'View your profile: https://shop.example.com/profile',
    );
    expect(content.html).toContain('max-width:480px');
  });

  it('formats order amounts without losing precision and uses local time', () => {
    expect(formatEmailMoney('1234.5')).toBe('LKR 1,234.50');
    expect(formatEmailMoney('0')).toBe('LKR 0.00');
    expect(formatEmailMoney('9999999999999999999999999999.99')).toBe(
      'LKR 9,999,999,999,999,999,999,999,999,999.99',
    );
    expect(formatEmailDate(new Date('2026-10-20T04:30:00Z'))).toMatch(
      /20 Oct 2026, 10:00 am \(Sri Lanka time\)/i,
    );
    expect(orderReference('a1b2c3d4-5678-9012-3456-789012345678')).toBe(
      'Order #A1B2C3D4',
    );
  });

  it('resolves stored upload paths only with a configured public asset origin', () => {
    delete process.env.EMAIL_ASSET_BASE_URL;
    expect(emailImageUrl('/media/images/product.jpg')).toBeUndefined();
    process.env.EMAIL_ASSET_BASE_URL = 'https://api.example.com';
    expect(emailImageUrl('/media/images/product.jpg')).toBe(
      'https://api.example.com/media/images/product.jpg',
    );
    expect(emailImageUrl('https://cdn.example.com/product.jpg?a=1&b=2')).toBe(
      'https://cdn.example.com/product.jpg?a=1&b=2',
    );
    for (const source of [
      '//untrusted.example/image.jpg',
      '/\\untrusted.example/image.jpg',
      'javascript:alert(1)',
      'data:image/svg+xml,bad',
      'file:///private/image.png',
      'https://user:password@example.com/image.jpg',
      'https://example.com/line\nbreak.jpg',
    ])
      expect(emailImageUrl(source)).toBeUndefined();
  });

  it('renders saved order images, skips unsafe images, and retains every item in plain text', () => {
    const order = Object.assign(new Order(), {
      id: 'a1b2c3d4-5678-9012-3456-789012345678',
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: new Date('2026-10-20T04:30:00Z'),
      total: '3703.50',
      delivery: {
        firstName: 'Buyer',
        lastName: 'Name',
        addressLine1: 'Colombo',
        city: 'Colombo',
        countryCode: 'LK',
      },
      items: [
        {
          name: 'Phone <128 GB>',
          SKU: 'PH-001',
          images: [
            'javascript:alert(1)',
            'https://cdn.example.com/phone.jpg?a=1&b=2',
          ],
          quantity: 2,
          unitPrice: '1234.50',
          lineTotal: '2469.00',
        },
        {
          name: 'Case & cover',
          SKU: 'CS-002',
          images: [],
          quantity: 1,
          unitPrice: '1234.50',
          lineTotal: '1234.50',
        },
      ],
    });
    const content = orderCreatedTemplate('Customer', order);
    expect(content.subject).toBe('Order #A1B2C3D4 has been placed');
    expect(content.html).toContain(
      'Full reference: a1b2c3d4-5678-9012-3456-789012345678',
    );
    expect(content.html).toContain('alt="Phone &lt;128 GB&gt;"');
    expect(content.html).toContain(
      'src="https://cdn.example.com/phone.jpg?a=1&amp;b=2"',
    );
    expect(content.html).not.toContain('javascript:');
    expect(content.html).toContain('No image');
    expect(content.html).toContain('LKR 3,703.50');
    expect(content.text).toContain(
      'Phone <128 GB> (SKU: PH-001)\nQty 2 × LKR 1,234.50 = LKR 2,469.00',
    );
    expect(content.text).toContain('Case & cover');
    expect(content.text).toContain('Payment is still required');
    expect(content.text).not.toContain('cid:');
  });
});
