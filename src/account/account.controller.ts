import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { AccountService } from './account.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountService.create(user.id, businessId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.accountService.findAllForBusiness(user.id, businessId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.accountService.findOneForBusiness(user.id, businessId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.update(user.id, businessId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.accountService.remove(user.id, businessId, id);
  }
}
