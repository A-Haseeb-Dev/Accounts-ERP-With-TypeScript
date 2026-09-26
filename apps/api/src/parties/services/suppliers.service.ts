import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/parties.dto';
import { dateRange } from '../../common/utils/date-filter';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  previewCode() {
    return this.numbering.preview('supplier', 'S', 3, { year: false });
  }

  async create(dto: CreateSupplierDto, actorId?: string) {
    const requestedCode = dto.code?.trim();
    if (requestedCode) {
      const existing = await this.prisma.supplier.findUnique({ where: { code: requestedCode } });
      if (existing) throw ApiException.duplicateCode('Supplier code');
    }
    const code = requestedCode || (await this.numbering.next('supplier', 'S', undefined, 3, { year: false }));
    if (dto.townId) {
      const town = await this.prisma.town.findUnique({ where: { id: dto.townId } });
      if (!town) throw ApiException.notFound('Town');
    }
    if (dto.pdcAccountId) {
      const pdc = await this.prisma.mainAccount.findUnique({ where: { id: dto.pdcAccountId } });
      if (!pdc) throw ApiException.notFound('PDC account');
    }

    const item = await this.prisma.supplier.create({
      data: {
        code,
        name: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        townId: dto.townId ?? null,
        mainAccountId: dto.mainAccountId ?? null,
        pdcAccountId: dto.pdcAccountId ?? null,
        openingBalance: dto.openingBalance ?? 0,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
      include: { town: true, mainAccount: true, pdcAccount: true },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'SUPPLIER', entity: 'Supplier',
      entityId: item.id, message: `Supplier ${item.name} (${item.code}) created`,
    });
    return item;
  }

  /**
   * Outstanding balance of a supplier.
   *
   * When the supplier is linked to a main account the posted voucher ledger is
   * the single source of truth: posting a purchase already writes Dr Inventory /
   * Cr Payable, so adding the document totals on top would count the same money
   * twice. Suppliers without a linked account fall back to summing documents.
   */
  private async calculateBalance(supplier: any): Promise<number> {
    let balance = Number(supplier.openingBalance ?? 0);
    if (supplier.mainAccountId) {
      const entries = await this.prisma.voucherEntry.findMany({
        where: { mainAccountId: supplier.mainAccountId, voucher: { status: 'posted' } },
        select: { debit: true, credit: true },
      });
      for (const e of entries) {
        balance += Number(e.credit) - Number(e.debit);
      }
      return round2(balance);
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
    return round2(balance);
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
      include: { town: true, mainAccount: true, pdcAccount: true, _count: { select: { purchases: true } } },
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
      include: { town: true, mainAccount: true, pdcAccount: true },
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
      // `dateRange` keeps the two bounds as siblings under one `voucherDate`
      // key. Spreading `{ voucherDate: ... }` twice instead would let the
      // second spread overwrite the first and silently drop the "from" bound.
      where.voucher = { status: 'posted', voucherDate: dateRange(from, to) };
    }

    const openingBalance = Number(supplier.openingBalance ?? 0);
    // Seed the running balance with everything already on the ledger before
    // this page, otherwise page 2+ restarts from the opening balance and every
    // balance shown from page 2 onwards is wrong.
    let running = openingBalance;

    const [entries, total, preceding] = await Promise.all([
      this.prisma.voucherEntry.findMany({
        where,
        include: { voucher: true },
        orderBy: [{ voucher: { voucherDate: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.voucherEntry.count({ where }),
      page > 1
        ? this.prisma.voucherEntry.findMany({
            where,
            select: { debit: true, credit: true },
            orderBy: [{ voucher: { voucherDate: 'asc' } }, { id: 'asc' }],
            take: (page - 1) * pageSize,
          })
        : Promise.resolve([]),
    ]);
    for (const e of preceding) {
      running += Number(e.credit) - Number(e.debit);
    }

    const withRunning = entries.map((e) => {
      running = round2(running + Number(e.credit) - Number(e.debit));
      return { ...e, runningBalance: running };
    });

    return {
      supplier,
      openingBalance,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
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

  async remove(id: string, actorId?: string, force = false) {
    const item = await this.findOne(id);
    const [purchaseCount, purchaseReturnCount] = await Promise.all([
      this.prisma.purchase.count({ where: { supplierId: id } }),
      this.prisma.purchaseReturn.count({ where: { supplierId: id } }),
    ]);
    const references: string[] = [];
    if (purchaseCount > 0) references.push(`${purchaseCount} purchase invoice${purchaseCount === 1 ? '' : 's'}`);
    if (purchaseReturnCount > 0) references.push(`${purchaseReturnCount} purchase return${purchaseReturnCount === 1 ? '' : 's'}`);
    if (references.length > 0 && !force) {
      throw ApiException.referencesExist(`Supplier "${item.name}"`, references);
    }
    if (references.length > 0) {
      await this.prisma.purchaseReturn.deleteMany({ where: { supplierId: id } });
      await this.prisma.purchase.deleteMany({ where: { supplierId: id } });
    }
    await this.prisma.supplier.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'SUPPLIER', entity: 'Supplier',
      entityId: id, message: `Supplier ${item.name} deleted with ${purchaseCount} purchase(s)`,
    });
    return { id, deleted: true };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

