import { IsString, MinLength } from 'class-validator';

export class CreateLedgerDto {
  @IsString()
  @MinLength(1)
  name: string;
}
