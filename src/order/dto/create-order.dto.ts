import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderPostingRule, OrderStatus } from '../../generated/prisma/client.js';
import { TrimToNull } from '../../common/validators.js';

const MAX_MONEY = 9_999_999_999;

// Customer name is required, so trim it but never turn it into null.
const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// There is deliberately no `total`: the server works it out
// (subtotal + delivery charge - discount) and a client-sent one is refused.
export class CreateOrderDto {
  // The fund account a delivered order posts its money into.
  @IsString()
  @MaxLength(64)
  accountId: string;

  @IsDateString()
  orderDate: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName: string;

  // Normalised on save (leading 0 restored, +880 dropped) — see common/phone.ts.
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+\-\s().]+$/, { message: 'customerPhone may only contain digits, spaces and + - ( ) .' })
  customerPhone?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(254)
  customerEmail?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(500)
  customerAddress?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(2000)
  items?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  subtotal: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  deliveryCharge?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  discount?: number;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string | null;

  // Defaults to NEW. Allowed here so an order that is already delivered can be entered.
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // MONEY_IN adds the total to the fund when delivered; DEDUCT_FROM_FUND takes it out.
  @IsOptional()
  @IsEnum(OrderPostingRule)
  postingRule?: OrderPostingRule;

  // The fund entry is dated this day (the order date when empty).
  @IsOptional()
  @IsDateString()
  deliveryDate?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
