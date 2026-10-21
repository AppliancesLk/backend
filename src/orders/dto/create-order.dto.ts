import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { PrepareCheckoutDto } from '../../checkout/dto/prepare-checkout.dto';

export class CreateOrderDto extends PrepareCheckoutDto {
  @IsUUID()
  idempotencyKey: string;
  @IsOptional()
  @IsIn([PaymentMethod.PAYHERE, PaymentMethod.CASH_ON_DELIVERY])
  paymentMethod?: PaymentMethod.PAYHERE | PaymentMethod.CASH_ON_DELIVERY;

  @IsOptional()
  @IsString()
  @MaxLength(31)
  @Matches(/^\d{1,28}(\.\d{1,2})?$/)
  loyaltyAmount?: string;
}
