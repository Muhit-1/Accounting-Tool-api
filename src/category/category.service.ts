import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission } from '../generated/prisma/client.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async create(userId: string, businessId: string, dto: CreateCategoryDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    return this.prisma.category.create({
      data: { businessId, ...dto },
    });
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  private async findCategoryInBusiness(businessId: string, id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category.businessId !== businessId) {
      throw new ForbiddenException('This category does not belong to that business');
    }
    return category;
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return this.findCategoryInBusiness(businessId, id);
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateCategoryDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findCategoryInBusiness(businessId, id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findCategoryInBusiness(businessId, id);
    await this.prisma.category.delete({ where: { id } });
    return { id };
  }
}
