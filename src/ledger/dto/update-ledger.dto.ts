import { PartialType } from '@nestjs/mapped-types';
import { CreateLedgerDto } from './create-ledger.dto.js';

export class UpdateLedgerDto extends PartialType(CreateLedgerDto) {}
