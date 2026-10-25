import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Matches, MaxLength } from 'class-validator';
import { IMAGE_URL_PATTERN } from '../../common/utils/image-url';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(IMAGE_URL_PATTERN)
  imageUrl?: string | null;
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentID?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
