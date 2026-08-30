import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class CreateInvoiceDto {
  @IsString()
  clientId: string;

  // Optional override for the auto-assigned sequential number
  // (see InvoiceService.nextInvoiceNumber).
  @IsOptional()
  @IsString()
  @MinLength(1)
  number?: string;

  @IsDateString()
  issueDate: string;

  @IsString()
  terms: string;

  @IsDateString()
  dueDate: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @ArrayMinSize(1)
  items: InvoiceItemDto[];
}
