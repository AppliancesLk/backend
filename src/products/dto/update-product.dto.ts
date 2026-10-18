import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { ProductCatalogFieldsDto } from './product-catalog-fields.dto';
import { ArrayMaxSize, Matches, MaxLength } from 'class-validator';
import { IMAGE_URL_PATTERN } from '../../common/utils/image-url';
export class UpdateProductDto extends ProductCatalogFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  SKU?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  price?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  categoryID?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @MaxLength(2048, { each: true })
  @Matches(IMAGE_URL_PATTERN, { each: true })
  @IsString({ each: true })
  images?: string[];

  // Null explicitly clears this nullable column; omission preserves it.
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown> | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
