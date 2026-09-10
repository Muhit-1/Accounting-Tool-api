import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  // Business-scoped reports only — narrows to one ledger within the
  // venture. Ignored by the combined (all-businesses) report.
  @IsOptional()
  @IsString()
  ledgerId?: string;
}
