import type { DeliveryInformationDto } from '../../checkout/dto/delivery-information.dto';
import type { OrderStatus } from '../enums/order-status.enum';
export interface OrderResponseDto {
  id: string;
  customerId: string;
  sourceCartId: string;
  status: OrderStatus;
  currency: string;
  delivery: DeliveryInformationDto;
  subtotal: string;
  total: string;
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
