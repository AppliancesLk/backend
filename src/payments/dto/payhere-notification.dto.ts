import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class PayHereNotificationDto {
  @IsString() @MaxLength(80) merchant_id: string;
  @IsString() @MaxLength(100) order_id: string;
  @IsString() @MaxLength(100) payment_id: string;
  @IsString() @Matches(/^\d+(\.\d{2})$/) payhere_amount: string;
  @IsString() @Length(3, 3) payhere_currency: string;
  @IsString() @Matches(/^(2|0|-1|-2|-3)$/) status_code: string;
  @IsString() @Matches(/^[A-Fa-f0-9]{32}$/) md5sig: string;

  @IsOptional() @IsString() @MaxLength(255) custom_1?: string;
  @IsOptional() @IsString() @MaxLength(255) custom_2?: string;
  @IsOptional() @IsString() @MaxLength(80) method?: string;
  @IsOptional() @IsString() @MaxLength(500) status_message?: string;
  @IsOptional() @IsString() @MaxLength(120) card_holder_name?: string;
  @IsOptional() @IsString() @MaxLength(30) card_no?: string;
  @IsOptional() @IsString() @MaxLength(8) card_expiry?: string;
}
