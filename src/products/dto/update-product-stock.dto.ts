import { IsInt, Max, Min } from 'class-validator';
export class UpdateProductStockDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  stockQty: number;
}
