import { IsUUID } from 'class-validator';
import { PrepareCheckoutDto } from '../../checkout/dto/prepare-checkout.dto';

export class CreateOrderDto extends PrepareCheckoutDto {
  @IsUUID()
  idempotencyKey: string;
}
