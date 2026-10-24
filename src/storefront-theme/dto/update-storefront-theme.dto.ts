import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SeasonalTheme } from '../enums/seasonal-theme.enum';

export class UpdateStorefrontThemeDto {
  @IsEnum(SeasonalTheme) theme: SeasonalTheme;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  headline: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  message: string;
  @IsBoolean() showGreeting: boolean;
  @IsBoolean() decorations: boolean;
  @IsOptional()
  @IsBoolean()
  animations?: boolean;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt?: string | null;
  @IsInt() @Min(0) @Max(2147483646) version: number;
}
