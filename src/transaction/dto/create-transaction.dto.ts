import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { CategoryType } from '../../generated/prisma/client.js';

export class CreateTransactionDto {
  @IsString()
  ledgerId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  memo?: string;

  // Vendor you paid (EXPENSE) or client who paid you (INCOME) — usually
  // prefilled from a scanned/uploaded invoice.
  @IsOptional()
  @IsString()
  counterparty?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  // Whether this entry adds to (INCOME) or subtracts from (EXPENSE) the
  // business's running balance. Stored as a single debit/credit Line under
  // the transaction — see prisma/schema.prisma for the double-entry shape.
  @IsEnum(CategoryType)
  type: CategoryType;
}
