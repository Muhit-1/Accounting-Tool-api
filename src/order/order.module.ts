import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
