import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { AccessGrantService } from './access-grant.service.js';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/access-grants')
export class AccessGrantController {
  constructor(private readonly accessGrantService: AccessGrantService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateAccessGrantDto,
  ) {
    return this.accessGrantService.create(user.id, businessId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.accessGrantService.findAllForBusiness(user.id, businessId);
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.accessGrantService.revoke(user.id, businessId, id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('shared-with-me')
export class SharedWithMeController {
  constructor(private readonly accessGrantService: AccessGrantService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.accessGrantService.findSharedWithMe(user.id);
  }
}
