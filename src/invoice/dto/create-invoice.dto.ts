import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsString, ValidateNested } from 'class-validator';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class CreateInvoiceDto {
  @IsString()
  clientId: string;

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
