import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength } from 'class-validator';
import { CategoryType } from '../../generated/prisma/client.js';

export class CreateTransactionDto {
  @IsString()
  accountId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;

  // Vendor you paid (EXPENSE) or client who paid you (INCOME) — usually
  // prefilled from a scanned/uploaded invoice.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  @IsPositive()
  @Max(9_999_999_999)
  amount: number;

  // Whether this entry adds to (INCOME) or subtracts from (EXPENSE) the
  // business's running balance. Stored as a single debit/credit Line under
  // the transaction — see prisma/schema.prisma for the double-entry shape.
  @IsEnum(CategoryType)
  type: CategoryType;
}
