import { IsDateString, IsEmail, IsEnum, IsIn, ValidateIf } from 'class-validator';
import { AccessPermission, AccessScope } from '../../generated/prisma/client.js';

// Table-level sharing is stored here but not yet enforced per-resource —
// only BUSINESS-scope grants are actively checked (see BusinessService.assertAccess).
// Restricting this to known tables now keeps future enforcement well-defined.
const SHAREABLE_TABLES = ['categories', 'transactions', 'clients', 'invoices'] as const;

export class CreateAccessGrantDto {
  @IsEmail()
  granteeEmail: string;

  @IsEnum(AccessScope)
  scope: AccessScope;

  @ValidateIf((o: CreateAccessGrantDto) => o.scope === AccessScope.TABLE)
  @IsIn(SHAREABLE_TABLES)
  tableName?: string;

  @IsEnum(AccessPermission)
  permission: AccessPermission;

  @IsDateString()
  expiresAt: string;
}
