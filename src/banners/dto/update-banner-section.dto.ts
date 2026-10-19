import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Internal paths and HTTPS links only; protocol-relative and executable URLs are rejected.
export const BANNER_LINK = /^(?:\/(?!\/|\\)[^\s\\]*|https:\/\/[^\s\\]+)$/;
export class BannerSlideDto {
  @IsString()
  @MaxLength(2048)
  @Matches(BANNER_LINK)
  imageUrl: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  alt: string;

  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsString()
  @MaxLength(40)
  buttonText: string;

  @IsString()
  @MaxLength(2048)
  @Matches(/^(?:$|\/(?!\/|\\)[^\s\\]*|https:\/\/[^\s\\]+)$/)
  href: string;
}
export class UpdateBannerSectionDto {
  @IsBoolean()
  visible: boolean;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => BannerSlideDto)
  slides: BannerSlideDto[];
}
