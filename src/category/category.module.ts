import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}
