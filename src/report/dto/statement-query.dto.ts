import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// Fund statement filters. All optional: no dates = every date, no account =
// every account of the business.
export class StatementQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
