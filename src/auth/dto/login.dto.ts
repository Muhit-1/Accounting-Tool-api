import { IsEmail, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/validators.js';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(72)
  password: string;
}
