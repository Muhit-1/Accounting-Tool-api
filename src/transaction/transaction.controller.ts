import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { TransactionService } from './transaction.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';

const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionService.create(user.id, businessId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.transactionService.findAllForBusiness(user.id, businessId, accountId);
  }

  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.transactionService.getBalance(user.id, businessId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.transactionService.findOneForBusiness(user.id, businessId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(user.id, businessId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.transactionService.remove(user.id, businessId, id);
  }

  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES } }))
  attachReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.transactionService.attachReceipt(user.id, businessId, id, file);
  }

  @Get(':id/receipt')
  async getReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    const { buffer, filename, mimeType } = await this.transactionService.getReceipt(user.id, businessId, id);
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `inline; filename="${filename}"`,
    });
  }
}
