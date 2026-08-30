import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto.js';

// Full edit of an invoice's content (client, dates, terms, number, items).
// Status changes stay on the separate PATCH .../status endpoint.
export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}
