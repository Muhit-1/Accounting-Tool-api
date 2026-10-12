import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const MONTHLY_MAX_MONTHS = 36;
export const MONTHLY_DEFAULT_MONTHS = 12;

export class MonthlyQueryDto {
  // First month shown, "YYYY-MM". Missing = the window that ends this month.
  @IsOptional()
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/, { message: 'start must look like 2026-05' })
  start?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MONTHLY_MAX_MONTHS)
  months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountId?: string;
}
