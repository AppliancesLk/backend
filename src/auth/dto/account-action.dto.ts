import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AccountEmailDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}
export class AccountTokenDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token: string;
}
export class ResetPasswordDto extends AccountTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
