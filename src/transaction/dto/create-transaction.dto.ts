import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CategoryType } from '../../generated/prisma/client.js';
import { AMOUNT_TYPES, MAX_AMOUNT_INPUTS, MAX_INPUT_ABS, type AmountType } from '../../common/calc.js';
import { IsHttpsUrl, TrimToNull } from '../../common/validators.js';

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

  // Required for a plain (FIXED / no amountType) entry, exactly as before.
  // For any other amountType the server computes the amount from
  // amountInputs and ignores whatever is sent here.
  @ValidateIf((dto: CreateTransactionDto) => !dto.amountType || dto.amountType === 'FIXED')
  @IsNumber()
  @IsPositive()
  @Max(9_999_999_999)
  amount?: number;

  // Whether this entry adds to (INCOME) or subtracts from (EXPENSE) the
  // business's running balance. Stored as a single debit/credit Line under
  // the transaction — see prisma/schema.prisma for the double-entry shape.
  @IsEnum(CategoryType)
  type: CategoryType;

  // How the amount was entered (see common/calc.ts). Missing = FIXED.
  @IsOptional()
  @IsIn(AMOUNT_TYPES)
  amountType?: AmountType;

  // The named boxes, in order. Re-checked by computeAmount on the server.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_AMOUNT_INPUTS)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @Min(-MAX_INPUT_ABS, { each: true })
  @Max(MAX_INPUT_ABS, { each: true })
  amountInputs?: number[];

  // Optional https link to a screenshot/receipt. Empty clears it.
  @IsOptional()
  @TrimToNull()
  @IsHttpsUrl()
  proofUrl?: string | null;
}
