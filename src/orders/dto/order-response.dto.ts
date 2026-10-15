import type { DeliveryInformationDto } from '../../checkout/dto/delivery-information.dto';
import type { PaymentStatus } from '../../payments/enums/payment-status.enum';
import type { OrderStatus } from '../enums/order-status.enum';
import type { PaymentMethod } from '../../payments/enums/payment-method.enum';
export interface OrderResponseDto {
  id: string;
  customerId: string;
  sourceCartId: string;
  status: OrderStatus;
  currency: string;
  delivery: DeliveryInformationDto;
  subtotal: string;
  total: string;
  paymentMethod: PaymentMethod;
  loyaltyRedeemed: string;
  loyaltyEarned: string;
  history: { id: string; status: OrderStatus; createdAt: Date }[];
  preparedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    productId: string;
    name: string;
    SKU: string;
    images: string[];
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
}

export interface OrderStatusResponseDto {
  id: string;
  status: OrderStatus;
  updatedAt: Date;
}

export interface AdminOrderResponseDto extends OrderResponseDto {
  customer: {
    id: string;
    username: string;
    email: string;
  };
  payment: {
    id: string;
    status: PaymentStatus;
    method: PaymentMethod;
    amount: string;
    currency: string;
    updatedAt: Date;
  } | null;
}
