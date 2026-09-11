import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  // Business-scoped reports only — narrows to one account within the
  // venture. Ignored by the combined (all-businesses) report.
  @IsOptional()
  @IsString()
  accountId?: string;
}
