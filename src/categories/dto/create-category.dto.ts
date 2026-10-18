import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Matches, MaxLength } from 'class-validator';
import { IMAGE_URL_PATTERN } from '../../common/utils/image-url';

export class CreateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(IMAGE_URL_PATTERN)
  imageUrl?: string | null;
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsUUID()
  parentID?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
