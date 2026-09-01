import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateCustomerDto, UpdateCustomerDto } from '../dto/parties.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, actorId?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { code: dto.code } });
    if (existing) throw ApiException.duplicateCode('Customer code');
    if (dto.townId) {
      const town = await this.prisma.town.findUnique({ where: { id: dto.townId } });
      if (!town) throw ApiException.notFound('Town');
    }
    const accountId = dto.mainAccountId ?? undefined;

    const item = await this.prisma.customer.create({
      data: {
        code: dto.code,
        name: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        townId: dto.townId ?? null,
        mainAccountId: accountId ?? null,
        openingBalance: dto.openingBalance ?? 0,
        creditLimit: dto.creditLimit ?? 0,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
      include: { town: true, mainAccount: true },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'CUSTOMER', entity: 'Customer',
      entityId: item.id, message: `Customer ${item.name} (${item.code}) created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; townId?: string }) {
    const { page = 1, pageSize = 25, search, status, townId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (townId) where.townId = townId;

    const items = await this.prisma.customer.findMany({
      where,
      include: { town: true, mainAccount: true, _count: { select: { sales: true } } },
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.customer.count({ where });

    const enriched = [];
    for (const c of items) {
      enriched.push({ ...c, balance: await this.calculateBalance(c) });
    }

    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  private async calculateBalance(customer: any): Promise<number> {
    let balance = Number(customer.openingBalance ?? 0);
    if (customer.mainAccountId) {
      const entries = await this.prisma.voucherEntry.findMany({
        where: { mainAccountId: customer.mainAccountId },
        include: { voucher: { select: { status: true } } },
      });
      for (const e of entries) {
        if (e.voucher.status === 'cancelled') continue;
        balance += Number(e.debit) - Number(e.credit);
      }
    }
    const sales = await this.prisma.sale.aggregate({
      where: { customerId: customer.id, status: { in: ['posted'] } },
      _sum: { grandTotal: true, amountPaid: true },
    });
    const returns = await this.prisma.salesReturn.aggregate({
      where: { customerId: customer.id, status: 'posted' },
      _sum: { grandTotal: true },
    });
    balance += Number(sales._sum.grandTotal ?? 0) - Number(returns._sum.grandTotal ?? 0) - Number(sales._sum.amountPaid ?? 0);
    return balance;
  }

  async findAllFlat() {
    const customers = await this.prisma.customer.findMany({
      where: { status: 'active' },
      include: { town: true },
      orderBy: { name: 'asc' },
    });
    const enriched = [];
    for (const c of customers) {
      enriched.push({ ...c, balance: await this.calculateBalance(c) });
    }
    return enriched;
  }

  async findOne(id: string) {
    const item = await this.prisma.customer.findUnique({
      where: { id },
      include: { town: true, mainAccount: true },
    });
    if (!item) throw ApiException.notFound('Customer');
    return { ...item, balance: await this.calculateBalance(item) };
  }

  async findSalesHistory(id: string, query: { page?: number; pageSize?: number }) {
    await this.findOne(id);
    const { page = 1, pageSize = 25 } = query;
    const where = { customerId: id };
    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where, include: { items: { include: { item: true } } }, orderBy: { saleDate: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findReturnsHistory(id: string, query: { page?: number; pageSize?: number }) {
    await this.findOne(id);
    const { page = 1, pageSize = 25 } = query;
    const where = { customerId: id };
    const [items, total] = await Promise.all([
      this.prisma.salesReturn.findMany({
        where, include: { items: { include: { item: true } } }, orderBy: { returnDate: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findLedger(id: string, query: { page?: number; pageSize?: number; from?: string; to?: string }) {
    const customer = await this.findOne(id);
    const { page = 1, pageSize = 25, from, to } = query;
    if (!customer.mainAccountId) {
      throw ApiException.invalidTransaction('Customer has no linked account. Link a main account to enable ledger.');
    }

    const where: Record<string, unknown> = { mainAccountId: customer.mainAccountId, voucher: { status: 'posted' } };
    if (from || to) {
      where.voucher = {
        status: 'posted',
        ...(from ? { voucherDate: { gte: new Date(from) } } : {}),
        ...(to ? { voucherDate: { lte: new Date(to) } } : {}),
      };
    }

    const entries = await this.prisma.voucherEntry.findMany({
      where,
      include: { voucher: true },
      orderBy: { voucher: { voucherDate: 'asc' } },
    });
    const total = entries.length;
    const filtered = entries.slice((page - 1) * pageSize, page * pageSize);

    let running = Number(customer.openingBalance ?? 0);
    const withRunning = filtered.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance: running };
    });

    return {
      customer,
      openingBalance: Number(customer.openingBalance ?? 0),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      entries: withRunning,
    };
  }

  async update(id: string, dto: UpdateCustomerDto, actorId?: string) {
    await this.findOne(id);
    const item = await this.prisma.customer.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'CUSTOMER', entity: 'Customer',
      entityId: id, message: `Customer ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const saleCount = await this.prisma.sale.count({ where: { customerId: id } });
    if (saleCount > 0) {
      throw ApiException.invalidTransaction(`Customer "${item.name}" has ${saleCount} sale(s) and cannot be deleted. Deactivate instead.`);
    }
    await this.prisma.customer.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: 'CUSTOMER', entity: 'Customer',
      entityId: id, message: `Customer ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }
}