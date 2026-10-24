export enum PromotionAudience {
  ALL = 'ALL',
  SELECTED = 'SELECTED',
}
export interface PromotionContent {
  subject: string;
  headline: string;
  preheader: string;
  body: string;
  buttonText: string;
  buttonUrl: string;
  footerNote: string;
  audience: PromotionAudience;
  userIds: string[];
  productIds: string[];
}
export interface PromotionProduct {
  id: string;
  name: string;
  SKU: string;
  price: string;
  images: string[];
  link?: string;
}
export interface PromotionSnapshot extends PromotionContent {
  products: PromotionProduct[];
}
export type PromotionDeliveryStatus =
  'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'UNKNOWN';
export type PromotionRunStatus =
  'QUEUED' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
