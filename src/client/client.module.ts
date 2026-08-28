import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { ClientController } from './client.controller.js';
import { ClientService } from './client.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
