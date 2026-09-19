import { IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { IsLogoDataUri, MAX_LOGO_DATA_URI_LENGTH, NormalizeEmail } from '../../common/validators.js';

export const SUPPORTED_CURRENCIES = ['BDT', 'EUR', 'USD', 'CNY'] as const;

export class CreateBusinessDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LOGO_DATA_URI_LENGTH)
  @IsLogoDataUri()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: false })
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankRoutingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankSwiftCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  defaultTerms?: string;
}
