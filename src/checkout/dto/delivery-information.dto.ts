import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO31661Alpha2,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class DeliveryInformationDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsPhoneNumber('LK')
  @MaxLength(30)
  phone: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  addressLine1: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  city: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 -]{1,19}$/, {
    message:
      'postalCode must contain 2 to 20 letters, digits, spaces or hyphens',
  })
  postalCode: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryCode: string;
}
