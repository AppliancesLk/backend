import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatRequestDto {
  @IsUUID()
  productId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
