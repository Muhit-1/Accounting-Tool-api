import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPermission, Prisma } from '../generated/prisma/client.js';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async create(userId: string, businessId: string, dto: CreateClientDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    return this.prisma.client.create({
      data: { businessId, ...dto },
    });
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return this.prisma.client.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  private async findClientInBusiness(businessId: string, id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (client.businessId !== businessId) {
      throw new ForbiddenException('This client does not belong to that business');
    }
    return client;
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return this.findClientInBusiness(businessId, id);
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateClientDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findClientInBusiness(businessId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findClientInBusiness(businessId, id);
    try {
      await this.prisma.client.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Cannot delete a client that has invoices — delete those invoices first');
      }
      throw error;
    }
    return { id };
  }
}
