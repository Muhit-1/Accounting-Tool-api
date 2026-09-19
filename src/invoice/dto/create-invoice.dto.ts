import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class CreateInvoiceDto {
  @IsString()
  clientId: string;

  // Optional override for the auto-assigned sequential number
  // (see InvoiceService.nextInvoiceNumber).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  number?: string;

  @IsDateString()
  issueDate: string;

  @IsString()
  @MaxLength(5000)
  terms: string;

  @IsDateString()
  dueDate: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  items: InvoiceItemDto[];
}
