import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { ClientService } from '../client/client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, InvoiceStatus, Prisma } from '../generated/prisma/client.js';
import type { Business } from '../generated/prisma/client.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoicePdfService } from './pdf/invoice-pdf.service.js';
import type { InvoiceHtmlItem } from './pdf/invoice-template.js';
import { InvoiceStorageService } from './pdf/invoice-storage.service.js';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Prisma's Decimal fields (subTotal/total/quantity/rate/amount) serialize to
// JSON as strings (decimal.js's toJSON() returns toString()), which is
// correct for arbitrary precision but silently breaks any client-side
// arithmetic across multiple invoices (e.g. summing `total` string-
// concatenates instead of adding). Every response leaving this service
// coerces them back to numbers so the API's JSON contract matches its
// documented `number` types.
function serializeTotals<T extends { subTotal: unknown; total: unknown }>(invoice: T) {
  return { ...invoice, subTotal: Number(invoice.subTotal), total: Number(invoice.total) };
}

function serializeItems<T extends { quantity: unknown; rate: unknown; amount: unknown }>(items: T[]) {
  return items.map((item) => ({ ...item, quantity: Number(item.quantity), rate: Number(item.rate), amount: Number(item.amount) }));
}

function toBusinessPdfData(business: Business) {
  return {
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
  };
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

  async previewNextNumber(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return { number: await this.nextInvoiceNumber(businessId) };
  }

  private async findInvoiceInBusiness(businessId: string, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.businessId !== businessId) {
      throw new ForbiddenException('This invoice does not belong to that business');
    }
    return invoice;
  }

  // Kept separate from findInvoiceInBusiness so the `items`/`client` include
  // shape is a literal at the call site — Prisma can only infer the payload
  // type (and let callers destructure .items/.client) when it sees that.
  private async findInvoiceWithItemsAndClient(businessId: string, id: string) {
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

  async create(userId: string, businessId: string, dto: CreateInvoiceDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const client = await this.clientService.findOneForBusiness(userId, businessId, dto.clientId);

    const items = dto.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: round2(item.quantity * item.rate),
    }));
    const subTotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
    const total = subTotal;
    const number = dto.number ?? (await this.nextInvoiceNumber(businessId));

    let invoice;
    try {
      invoice = await this.prisma.invoice.create({
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That invoice number is already in use');
      }
      throw error;
    }

    // PDF rendering/storage happens outside the DB write above (file I/O
    // can't join a Prisma transaction). If either step fails, delete the
    // just-created invoice rather than leaving a DRAFT row with no PDF
    // behind — the caller sees one clean error instead of a ghost invoice.
    try {
      const pdf = await this.pdfService.render({
        business: toBusinessPdfData(business),
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

      const saved = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { fileReference },
        include: { items: true },
      });
      return { ...serializeTotals(saved), items: serializeItems(saved.items) };
    } catch (error) {
      await this.prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
      throw error;
    }
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const invoices = await this.prisma.invoice.findMany({
      where: { businessId },
      orderBy: { issueDate: 'desc' },
      include: { client: true },
    });
    return invoices.map((invoice) => serializeTotals(invoice));
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const invoice = await this.findInvoiceWithItemsAndClient(businessId, id);
    return { ...serializeTotals(invoice), items: serializeItems(invoice.items) };
  }

  // Full content edit (client, dates, terms, number, items) — regenerates
  // the PDF in place. Status stays on the separate updateStatus() below.
  async update(userId: string, businessId: string, id: string, dto: UpdateInvoiceDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const existing = await this.findInvoiceWithItemsAndClient(businessId, id);

    const client = dto.clientId
      ? await this.clientService.findOneForBusiness(userId, businessId, dto.clientId)
      : existing.client;

    const itemInputs = dto.items ?? existing.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
    }));
    const items = itemInputs.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: round2(item.quantity * item.rate),
    }));
    const subTotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
    const total = subTotal;

    const number = dto.number ?? existing.number;
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : existing.issueDate;
    const terms = dto.terms ?? existing.terms;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : existing.dueDate;

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        return tx.invoice.update({
          where: { id },
          data: {
            clientId: client.id,
            number,
            issueDate,
            terms,
            dueDate,
            subTotal,
            total,
            items: { create: items.map((item, position) => ({ ...item, position })) },
          },
          include: { items: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That invoice number is already in use');
      }
      throw error;
    }

    const pdf = await this.pdfService.render({
      business: toBusinessPdfData(business),
      client: { name: client.name, address: client.address },
      invoice: {
        number: updated.number,
        issueDate: updated.issueDate,
        terms: updated.terms,
        dueDate: updated.dueDate,
        subTotal: Number(updated.subTotal),
        total: Number(updated.total),
      },
      items: items.map((item): InvoiceHtmlItem => ({ ...item })),
    });

    // Same invoiceId → same on-disk path, so this overwrites the old PDF.
    const fileReference = await this.storageService.save(businessId, id, pdf);

    const saved = await this.prisma.invoice.update({
      where: { id },
      data: { fileReference },
      include: { items: true, client: true },
    });
    return { ...serializeTotals(saved), items: serializeItems(saved.items) };
  }

  async updateStatus(userId: string, businessId: string, id: string, status: InvoiceStatus) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findInvoiceInBusiness(businessId, id);
    const updated = await this.prisma.invoice.update({ where: { id }, data: { status } });
    return serializeTotals(updated);
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const invoice = await this.findInvoiceInBusiness(businessId, id);
    if (invoice.fileReference) {
      await this.storageService.remove(invoice.fileReference);
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { id };
  }

  async getPdf(userId: string, businessId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const invoice = await this.findInvoiceInBusiness(businessId, id);
    if (!invoice.fileReference) {
      throw new NotFoundException('This invoice has no generated PDF');
    }
    const buffer = await this.storageService.read(invoice.fileReference);
    return { buffer, filename: `invoice-${invoice.number}.pdf` };
  }
}
