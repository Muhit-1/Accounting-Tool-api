import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CategoryType } from '../../generated/prisma/client.js';
import { TrimToNull } from '../../common/validators.js';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(CategoryType)
  type: CategoryType;

  // Heading this category is listed under in pickers and the fund statement
  // (e.g. "Overhead"). Empty clears it; no group shows under "Other".
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  groupName?: string | null;
}
