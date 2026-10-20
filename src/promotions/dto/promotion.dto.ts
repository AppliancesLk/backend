import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PromotionAudience } from '../types/promotion.types';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeIds = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((id: unknown) =>
        typeof id === 'string' ? id.toLowerCase() : id,
      )
    : value;
export class PromotionContentDto {
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  @Matches(/^[^\r\n]*$/)
  subject: string;
  @Transform(trim) @IsString() @MaxLength(120) headline: string;
  @Transform(trim) @IsString() @MaxLength(180) preheader: string;
  @Transform(trim) @IsString() @MaxLength(6000) body: string;
  @Transform(trim) @IsString() @MaxLength(40) buttonText: string;
  @Transform(trim) @IsString() @MaxLength(1000) buttonUrl: string;
  @Transform(trim) @IsString() @MaxLength(240) footerNote: string;
  @IsEnum(PromotionAudience) audience: PromotionAudience;
  @Transform(normalizeIds)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  userIds: string[];
  @Transform(normalizeIds)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  productIds: string[];
}
export class UpdatePromotionDto extends PromotionContentDto {
  @IsInt() @Min(0) @Max(2147483646) version: number;
}
export class SendPromotionDto {
  @IsInt() @Min(0) @Max(2147483646) version: number;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  requestId: string;
  @IsInt() @Min(1) expectedRecipients: number;
}
export class PromotionListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsString() @MaxLength(100) search = '';
}
