import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { CategoryType } from '../../generated/prisma/client.js';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(CategoryType)
  type: CategoryType;
}
