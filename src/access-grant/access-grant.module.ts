import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { AccessGrantController, SharedWithMeController } from './access-grant.controller.js';
import { AccessGrantService } from './access-grant.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [AccessGrantController, SharedWithMeController],
  providers: [AccessGrantService],
})
export class AccessGrantModule {}
