import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  getCombined(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getCombinedDashboard(user.id);
  }

  @Get('businesses/:businessId/dashboard')
  getForBusiness(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.dashboardService.getBusinessDashboard(user.id, businessId);
  }
}
