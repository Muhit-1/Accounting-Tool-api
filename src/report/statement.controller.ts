import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { FundStatementService } from './fund-statement.service.js';
import { MonthlyService } from './monthly.service.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';
import { MonthlyQueryDto } from './dto/monthly-query.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId')
export class StatementController {
  constructor(
    private readonly fundStatementService: FundStatementService,
    private readonly monthlyService: MonthlyService,
  ) {}

  @Get('fund-statement')
  getFundStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Query() query: StatementQueryDto,
  ) {
    return this.fundStatementService.getStatement(user.id, businessId, query);
  }

  @Get('monthly')
  getMonthly(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Query() query: MonthlyQueryDto,
  ) {
    return this.monthlyService.getMonthly(user.id, businessId, query);
  }
}
