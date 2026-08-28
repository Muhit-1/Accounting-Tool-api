import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateBusinessDto) {
    return this.prisma.business.create({
      data: { ownerId, ...dto },
    });
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOneForOwner(ownerId: string, id: string) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not have access to this business');
    }
    return business;
  }

  async update(ownerId: string, id: string, dto: UpdateBusinessDto) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.business.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);
    await this.prisma.business.delete({ where: { id } });
    return { id };
  }
}
