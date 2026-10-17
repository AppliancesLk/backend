import { Type } from 'class-transformer';
import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { DeliveryInformationDto } from './delivery-information.dto';

export class PrepareCheckoutDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryInformationDto)
  delivery: DeliveryInformationDto;
}
