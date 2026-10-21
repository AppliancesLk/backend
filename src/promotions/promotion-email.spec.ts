import {
  promotionEmail,
  promotionPreview,
} from './services/promotions.service';
import {
  PromotionAudience,
  type PromotionSnapshot,
} from './types/promotion.types';
describe('Promotion email rendering', () => {
  const snapshot: PromotionSnapshot = {
    subject: 'An offer for you',
    headline: 'Everyday favourites',
    preheader: 'A useful little upgrade',
    body: 'First paragraph.\n\n<script>unsafe()</script>',
    buttonText: 'Shop the collection',
    buttonUrl: 'https://appliances.example/products',
    footerNote: 'While stocks last.',
    audience: PromotionAudience.SELECTED,
    userIds: [],
    productIds: [],
    products: [
      {
        id: 'p',
        name: 'Washer & dryer',
        SKU: 'W1',
        price: '12345.00',
        images: ['javascript:alert(1)', 'https://cdn.example/washer.png'],
        link: 'https://appliances.example/products/p',
      },
    ],
  };
  it('renders editable text, product images, prices and safe links with a plain-text alternative', () => {
    const email = promotionEmail(snapshot, 'Customer <test>');
    expect(email.subject).toBe(snapshot.subject);
    expect(email.html).toContain('Customer &lt;test&gt;');
    expect(email.html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
    expect(email.html).not.toContain('javascript:');
    expect(email.html).toContain('https://cdn.example/washer.png');
    expect(email.text).toContain('LKR 12,345.00');
    expect(email.text).toContain(snapshot.buttonText);
    expect(email.html).toContain('First paragraph.<br><br>');
  });
  it('embeds CID branding only in previews and preserves production attachments', () => {
    const email = promotionEmail(snapshot),
      preview = promotionPreview(snapshot);
    expect(email.attachments).toHaveLength(1);
    expect(email.html).toContain('cid:');
    expect(preview.html).not.toContain('cid:');
    expect(preview.html).toContain('data:image/png;base64,');
    expect(preview.html).toContain('pointer-events:none');
    expect(preview.subject).toBe(email.subject);
  });
});
