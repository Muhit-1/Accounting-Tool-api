import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/validators.js';

export class CreateClientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
