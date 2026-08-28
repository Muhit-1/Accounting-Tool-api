import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
