import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { RateLimit } from '../common/rate-limit.guard.js';
import { TransactionService } from './transaction.service.js';
import { BulkCreateTransactionsDto } from './dto/bulk-transactions.dto.js';

const BULK_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// Paste / import land here: many entries in one request, and the undo for them.
@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/accounts/:accountId/transactions')
export class TransactionBulkController {
  constructor(private readonly transactionService: TransactionService) {}

  @RateLimit(BULK_RATE_LIMIT)
  @Post('bulk')
  bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('accountId') accountId: string,
    @Body() dto: BulkCreateTransactionsDto,
  ) {
    return this.transactionService.bulkCreate(user.id, businessId, accountId, dto);
  }

  @RateLimit(BULK_RATE_LIMIT)
  @Delete('batch/:importBatchId')
  removeBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('accountId') accountId: string,
    @Param('importBatchId') importBatchId: string,
  ) {
    return this.transactionService.removeBatch(user.id, businessId, accountId, importBatchId);
  }
}
