import { IsUUID } from 'class-validator';
import { UpdateCartItemDto } from './update-cart-item.dto';

export class AddCartItemDto extends UpdateCartItemDto {
  @IsUUID()
  productId: string;
}
