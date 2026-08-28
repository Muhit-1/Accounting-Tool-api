import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  description: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  rate: number;
}
