import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/client.js';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  // Sets the delivery date in the same step ("mark delivered today").
  @IsOptional()
  @IsDateString()
  deliveryDate?: string | null;
}
