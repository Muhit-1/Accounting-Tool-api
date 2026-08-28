import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { ClientService } from '../client/client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvoiceStatus } from '../generated/prisma/client.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { InvoicePdfService } from './pdf/invoice-pdf.service.js';
import { InvoiceStorageService } from './pdf/invoice-storage.service.js';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
    private readonly clientService: ClientService,
    private readonly pdfService: InvoicePdfService,
    private readonly storageService: InvoiceStorageService,
  ) {}

  private async nextInvoiceNumber(businessId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { businessId } });
    return String(1001 + count);
  }

  async create(ownerId: string, businessId: string, dto: CreateInvoiceDto) {
    const business = await this.businessService.findOneForOwner(ownerId, businessId);
    const client = await this.clientService.findOneForBusiness(ownerId, businessId, dto.clientId);

    const items = dto.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: round2(item.quantity * item.rate),
    }));
    const subTotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
    const total = subTotal;
    const number = await this.nextInvoiceNumber(businessId);

    const invoice = await this.prisma.invoice.create({
      data: {
        businessId,
        clientId: client.id,
        number,
        issueDate: new Date(dto.issueDate),
        terms: dto.terms,
        dueDate: new Date(dto.dueDate),
        subTotal,
        total,
        status: InvoiceStatus.DRAFT,
        items: {
          create: items.map((item, position) => ({ ...item, position })),
        },
      },
      include: { items: true },
    });

    const pdf = await this.pdfService.render({
      business: {
        name: business.name,
        logoUrl: business.logoUrl,
        address: business.address,
        contactEmail: business.contactEmail,
        website: business.website,
        currency: business.currency,
        bankAccountName: business.bankAccountName,
        bankAccountNumber: business.bankAccountNumber,
        bankRoutingNumber: business.bankRoutingNumber,
        bankSwiftCode: business.bankSwiftCode,
        bankBranch: business.bankBranch,
        defaultTerms: business.defaultTerms,
      },
      client: { name: client.name, address: client.address },
      invoice: {
        number: invoice.number,
        issueDate: invoice.issueDate,
        terms: invoice.terms,
        dueDate: invoice.dueDate,
        subTotal: Number(invoice.subTotal),
        total: Number(invoice.total),
      },
      items: items.map((item) => ({ ...item })),
    });

    const fileReference = await this.storageService.save(businessId, invoice.id, pdf);

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { fileReference },
      include: { items: true },
    });
  }

  async findAllForBusiness(ownerId: string, businessId: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    return this.prisma.invoice.findMany({
      where: { businessId },
      orderBy: { issueDate: 'desc' },
      include: { client: true },
    });
  }

  async findOneForBusiness(ownerId: string, businessId: string, id: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, client: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.businessId !== businessId) {
      throw new ForbiddenException('This invoice does not belong to that business');
    }
    return invoice;
  }

  async updateStatus(ownerId: string, businessId: string, id: string, status: InvoiceStatus) {
    await this.findOneForBusiness(ownerId, businessId, id);
    return this.prisma.invoice.update({ where: { id }, data: { status } });
  }

  async remove(ownerId: string, businessId: string, id: string) {
    const invoice = await this.findOneForBusiness(ownerId, businessId, id);
    if (invoice.fileReference) {
      await this.storageService.remove(invoice.fileReference);
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { id };
  }

  async getPdf(ownerId: string, businessId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOneForBusiness(ownerId, businessId, id);
    if (!invoice.fileReference) {
      throw new NotFoundException('This invoice has no generated PDF');
    }
    const buffer = await this.storageService.read(invoice.fileReference);
    return { buffer, filename: `invoice-${invoice.number}.pdf` };
  }
}
