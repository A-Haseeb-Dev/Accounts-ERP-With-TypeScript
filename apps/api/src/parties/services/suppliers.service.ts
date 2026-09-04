import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/parties.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async create(dto: CreateSupplierDto, actorId?: string) {
    const requestedCode = dto.code?.trim();
    if (requestedCode) {
      const existing = await this.prisma.supplier.findUnique({ where: { code: requestedCode } });
      if (existing) throw ApiException.duplicateCode('Supplier code');
    }
    const code = requestedCode || (await this.numbering.next('supplier', 'SUP'));
    if (dto.townId) {
      const town = await this.prisma.town.findUnique({ where: { id: dto.townId } });
      if (!town) throw ApiException.notFound('Town');
    }

    const item = await this.prisma.supplier.create({
      data: {
        code,
        name: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        townId: dto.townId ?? null,
        mainAccountId: dto.mainAccountId ?? null,
        openingBalance: dto.openingBalance ?? 0,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
      include: { town: true, mainAccount: true },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'SUPPLIER', entity: 'Supplier',
      entityId: item.id, message: `Supplier ${item.name} (${item.code}) created`,
    });
    return item;
  }

  private async calculateBalance(supplier: any): Promise<number> {
    let balance = Number(supplier.openingBalance ?? 0);
    if (supplier.mainAccountId) {
      const entries = await this.prisma.voucherEntry.findMany({
        where: { mainAccountId: supplier.mainAccountId },
        include: { voucher: { select: { status: true } } },
      });
      for (const e of entries) {
        if (e.voucher.status === 'cancelled') continue;
        balance += Number(e.credit) - Number(e.debit);
      }
    }
    const purchases = await this.prisma.purchase.aggregate({
      where: { supplierId: supplier.id, status: 'posted' },
      _sum: { grandTotal: true },
    });
    const returns = await this.prisma.purchaseReturn.aggregate({
      where: { supplierId: supplier.id, status: 'posted' },
      _sum: { grandTotal: true },
    });
    balance += Number(purchases._sum.grandTotal ?? 0) - Number(returns._sum.grandTotal ?? 0);
    return balance;
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

    const items = await this.prisma.supplier.findMany({
      where,
      include: { town: true, mainAccount: true, _count: { select: { purchases: true } } },
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.supplier.count({ where });

    const enriched = [];
    for (const s of items) {
      enriched.push({ ...s, balance: await this.calculateBalance(s) });
    }

    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { status: 'active' },
      include: { town: true },
      orderBy: { name: 'asc' },
    });
    const enriched = [];
    for (const s of suppliers) {
      enriched.push({ ...s, balance: await this.calculateBalance(s) });
    }
    return enriched;
  }

  async findOne(id: string) {
    const item = await this.prisma.supplier.findUnique({
      where: { id },
      include: { town: true, mainAccount: true },
    });
    if (!item) throw ApiException.notFound('Supplier');
    return { ...item, balance: await this.calculateBalance(item) };
  }

  async findPurchaseHistory(id: string, query: { page?: number; pageSize?: number }) {
    await this.findOne(id);
    const { page = 1, pageSize = 25 } = query;
    const where = { supplierId: id };
    const [items, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where, include: { items: { include: { item: true } } }, orderBy: { purchaseDate: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findReturnHistory(id: string, query: { page?: number; pageSize?: number }) {
    await this.findOne(id);
    const { page = 1, pageSize = 25 } = query;
    const where = { supplierId: id };
    const [items, total] = await Promise.all([
      this.prisma.purchaseReturn.findMany({
        where, include: { items: { include: { item: true } } }, orderBy: { returnDate: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findLedger(id: string, query: { page?: number; pageSize?: number; from?: string; to?: string }) {
    const supplier = await this.findOne(id);
    const { page = 1, pageSize = 25, from, to } = query;
    if (!supplier.mainAccountId) {
      throw ApiException.invalidTransaction('Supplier has no linked account. Link a main account to enable ledger.');
    }

    const where: Record<string, unknown> = { mainAccountId: supplier.mainAccountId, voucher: { status: 'posted' } };
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

    let running = Number(supplier.openingBalance ?? 0);
    const withRunning = filtered.map((e) => {
      running += Number(e.credit) - Number(e.debit);
      return { ...e, runningBalance: running };
    });

    return {
      supplier,
      openingBalance: Number(supplier.openingBalance ?? 0),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      entries: withRunning,
    };
  }

  async update(id: string, dto: UpdateSupplierDto, actorId?: string) {
    await this.findOne(id);
    const item = await this.prisma.supplier.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'SUPPLIER', entity: 'Supplier',
      entityId: id, message: `Supplier ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const purchaseCount = await this.prisma.purchase.count({ where: { supplierId: id } });
    if (purchaseCount > 0) {
      throw ApiException.invalidTransaction(`Supplier "${item.name}" has ${purchaseCount} purchase(s) and cannot be deleted. Deactivate instead.`);
    }
    await this.prisma.supplier.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: 'SUPPLIER', entity: 'Supplier',
      entityId: id, message: `Supplier ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }
}