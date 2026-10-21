import type { PaymentStatus } from '../enums/payment-status.enum';
import type { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentResponseDto {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayHereInitiationDto {
  payment: PaymentResponseDto;
  gatewayUrl: string;
  paymentData: {
    sandbox: boolean;
    merchant_id: string;
    return_url: string;
    cancel_url: string;
    notify_url: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    order_id: string;
    items: string;
    currency: string;
    amount: string;
    hash: string;
  };
}
