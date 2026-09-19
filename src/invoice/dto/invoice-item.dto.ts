import { IsNumber, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description: string;

  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @IsNumber()
  @IsPositive()
  @Max(9_999_999_999)
  rate: number;
}
