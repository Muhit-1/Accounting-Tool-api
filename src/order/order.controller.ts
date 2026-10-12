import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { OrderService } from './order.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string, @Body() dto: CreateOrderDto) {
    return this.orderService.create(user.id, businessId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.orderService.findAllForBusiness(user.id, businessId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string, @Param('id') id: string) {
    return this.orderService.findOneForBusiness(user.id, businessId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(user.id, businessId, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orderService.update(user.id, businessId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string, @Param('id') id: string) {
    return this.orderService.remove(user.id, businessId, id);
  }
}
