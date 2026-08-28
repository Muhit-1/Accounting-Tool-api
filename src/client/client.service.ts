import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
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

  async create(ownerId: string, businessId: string, dto: CreateClientDto) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    return this.prisma.client.create({
      data: { businessId, ...dto },
    });
  }

  async findAllForBusiness(ownerId: string, businessId: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    return this.prisma.client.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async findOneForBusiness(ownerId: string, businessId: string, id: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (client.businessId !== businessId) {
      throw new ForbiddenException('This client does not belong to that business');
    }
    return client;
  }

  async update(ownerId: string, businessId: string, id: string, dto: UpdateClientDto) {
    await this.findOneForBusiness(ownerId, businessId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, businessId: string, id: string) {
    await this.findOneForBusiness(ownerId, businessId, id);
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
