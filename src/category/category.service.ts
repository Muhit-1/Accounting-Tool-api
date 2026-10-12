import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission } from '../generated/prisma/client.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

// What the API sends for a category: the system key stays on the server, the
// client only learns whether the category is one the system files entries
// under by itself ("Orders (auto)", ...), which are locked.
export function categoryResponse<T extends { systemKey?: string | null }>(category: T): Omit<T, 'systemKey'> & { isSystem: boolean } {
  const { systemKey, ...rest } = category;
  return { ...rest, isSystem: systemKey != null };
}

const SYSTEM_CATEGORY_MESSAGE = 'This category is posted automatically and cannot be changed by hand.';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async create(userId: string, businessId: string, dto: CreateCategoryDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    return categoryResponse(await this.prisma.category.create({ data: { businessId, ...dto } }));
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const categories = await this.prisma.category.findMany({ where: { businessId }, orderBy: { name: 'asc' } });
    return categories.map(categoryResponse);
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
    return categoryResponse(await this.findCategoryInBusiness(businessId, id));
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateCategoryDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const category = await this.findCategoryInBusiness(businessId, id);
    if (category.systemKey) {
      throw new ConflictException(SYSTEM_CATEGORY_MESSAGE);
    }
    return categoryResponse(await this.prisma.category.update({ where: { id }, data: dto }));
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const category = await this.findCategoryInBusiness(businessId, id);
    if (category.systemKey) {
      throw new ConflictException(SYSTEM_CATEGORY_MESSAGE);
    }
    await this.prisma.category.delete({ where: { id } });
    return { id };
  }
}
