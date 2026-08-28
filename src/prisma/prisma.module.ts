import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Not imported into AppModule yet — wire this in once a real database
// connection is available (see README "Status").
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
