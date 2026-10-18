import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsInt,
  Max,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { ProductCatalogFieldsDto } from './product-catalog-fields.dto';
import { ArrayMaxSize, Matches, MaxLength } from 'class-validator';
import { IMAGE_URL_PATTERN } from '../../common/utils/image-url';
export class CreateProductDto extends ProductCatalogFieldsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  SKU: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(9999999999.99)
  @Min(0)
  price: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  stockQty?: number;

  @IsUUID()
  categoryID: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @MaxLength(2048, { each: true })
  @Matches(IMAGE_URL_PATTERN, { each: true })
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
