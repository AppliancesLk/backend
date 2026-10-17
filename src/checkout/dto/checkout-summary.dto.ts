import { DeliveryInformationDto } from './delivery-information.dto';

export interface CheckoutSummaryDto {
  cartId: string;
  customerId: string;
  preparedAt: string;
  currency: 'LKR';
  items: {
    cartItemId: string;
    productId: string;
    name: string;
    SKU: string;
    images: string[];
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
  itemCount: number;
  subtotal: string;
  total: string;
  delivery: DeliveryInformationDto;
}
