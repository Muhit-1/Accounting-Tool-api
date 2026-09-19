import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/validators.js';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  // bcrypt only hashes the first 72 bytes — a longer cap keeps the limit
  // honest and stops multi-megabyte "passwords" from tying up the hasher.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}
