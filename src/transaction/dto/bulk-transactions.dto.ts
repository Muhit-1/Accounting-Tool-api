import { OmitType } from '@nestjs/mapped-types';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, Matches } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto.js';

export const MAX_BULK_ROWS = 1000;

// One pasted / imported row: exactly what a single new entry takes (same
// validators), minus the account, which comes from the URL.
export class BulkTransactionRowDto extends OmitType(CreateTransactionDto, ['accountId'] as const) {}

export class BulkCreateTransactionsDto {
  // Rows added together share this id so the whole batch can be undone. The
  // server makes one when it is left out.
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'importBatchId may only contain letters, digits, - and _ (up to 64)' })
  importBatchId?: string;

  // Each item is checked one by one against BulkTransactionRowDto by the
  // service, so a bad row is reported with its own position, not as one
  // anonymous 400 for the whole request.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_ROWS)
  rows: unknown[];
}
