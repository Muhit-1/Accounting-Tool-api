import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto.js';

// The status is not edited here: it moves through PATCH .../:id/status, which
// checks the allowed moves and posts/removes the fund entry.
export class UpdateOrderDto extends PartialType(OmitType(CreateOrderDto, ['status'] as const)) {}
