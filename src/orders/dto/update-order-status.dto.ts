import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
  @IsOptional()
  @IsBoolean()
  paymentCollected?: boolean;
}
