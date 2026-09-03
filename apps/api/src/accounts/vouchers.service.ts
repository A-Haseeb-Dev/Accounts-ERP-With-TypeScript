import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { AccountingService } from '../common/services/accounting.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateVoucherDto } from './dto/vouchers.dto';

const TYPE_PREFIX: Record<string, string> = {
  JOURNAL: 'JV',
  CREDIT: 'CV',
  DEBIT: 'DV',
};

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
  ) {}

  async create(dto: CreateVoucherDto, actorId?: string) {
    if (!dto.entries.some((e) => Number(e.debit ?? 0) > 0)) {
      throw ApiException.validation('A debit entry is required');
    }
    if (!dto.entries.some((e) => Number(e.credit ?? 0) > 0)) {
      throw ApiException.validation('A credit entry is required');
    }
    // Pre-validate balance before opening a transaction.
    this.accounting.assertBalanced(dto.entries);

    const number = await this.numbering.next(
      `voucher_${dto.voucherType.toLowerCase()}`,
      TYPE_PREFIX[dto.voucherType],
    );

    try {
      const voucher = await this.prisma.$transaction(async (tx) => {
        const created = await this.accounting.createVoucher(
          tx,
          {
            voucherType: dto.voucherType,
            voucherDate: new Date(dto.voucherDate),
            description: dto.description,
            reference: dto.reference,
            entries: dto.entries,
            createdById: actorId,
          },
          number,
        );
        this.audit.record({
          userId: actorId,
          action: 'CREATE',
          module: 'VOUCHER',
          entity: 'Voucher',
          entityId: created.id,
          message: `${dto.voucherType} voucher ${number} created (net ${created.totalDebit})`,
        });
        return created;
      });
      return voucher;
    } catch (err) {
      if ((err as Error).message?.startsWith('ERR_UNBALANCED')) throw err;
      throw err;
    }
  }

  async post(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');

    const posted = await this.prisma.$transaction(async (tx) => {
      const result = await this.accounting.postVoucher(tx, id, actorId);
      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'VOUCHER',
        entity: 'Voucher',
        entityId: id,
        message: `${voucher.voucherType} voucher ${voucher.number} posted`,
      });
      return result;
    });
    return posted;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const result = await this.accounting.cancelVoucher(tx, id, reason, actorId);
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'VOUCHER',
        entity: 'Voucher',
        entityId: id,
        message: `${voucher.voucherType} voucher ${voucher.number} cancelled`,
        metadata: { reason },
      });
      return result;
    });
    return cancelled;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    voucherType?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, voucherType, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (voucherType) where.voucherType = voucherType;
    if (from || to) {
      where.voucherDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: { createdBy: { select: { id: true, fullName: true, username: true } }, entries: { include: { mainAccount: true } } },
        orderBy: { voucherDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async cashBook(query: { page?: number; pageSize?: number; from?: string; to?: string; search?: string }) {
    const { page = 1, pageSize = 25, from, to, search } = query;
    const cashAccountId = await this.prisma.systemSetting.findFirst({
      where: { key: 'accounting.cash_account' },
    });

    const where: Record<string, unknown> = {
      voucher: { status: 'posted' },
    };
    if (cashAccountId?.value) where.mainAccountId = cashAccountId.value;
    if (search) {
      where.OR = [
        { voucher: { number: { contains: search, mode: 'insensitive' } } },
        { voucher: { description: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (from || to) {
      where.voucher = {
        status: 'posted',
        ...(from ? { voucherDate: { gte: new Date(from) } } : {}),
        ...(to ? { voucherDate: { lte: new Date(to) } } : {}),
      };
    }

    const entries = await this.prisma.voucherEntry.findMany({
      where,
      include: { voucher: { include: { createdBy: { select: { id: true, fullName: true } } } } },
      orderBy: { voucher: { voucherDate: 'asc' } },
    });
    const total = entries.length;

    const openingFromPrevious = 0;
    let running = openingFromPrevious;
    const enriched = entries.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance: running };
    });

    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      totalRunning: running,
    };
  }

  async findOne(id: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        entries: { include: { mainAccount: { include: { subHead: { include: { headAccount: true } } } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!voucher) throw ApiException.notFound('Voucher');
    return voucher;
  }

  async update(id: string, dto: CreateVoucherDto, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id, entries: { some: {} } }, include: { entries: true } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status !== 'draft') {
      throw ApiException.invalidTransaction(`Only draft vouchers can be edited. "${voucher.number}" is ${voucher.status}.`);
    }

    if (!dto.entries.some((e) => Number(e.debit ?? 0) > 0)) {
      throw ApiException.validation('A debit entry is required');
    }
    if (!dto.entries.some((e) => Number(e.credit ?? 0) > 0)) {
      throw ApiException.validation('A credit entry is required');
    }
    this.accounting.assertBalanced(dto.entries);

    const totalDebit = round2(dto.entries.reduce((s, e) => s + Number(e.debit ?? 0), 0));
    const totalCredit = round2(dto.entries.reduce((s, e) => s + Number(e.credit ?? 0), 0));

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
        return tx.voucher.update({
          where: { id },
          data: {
            voucherDate: new Date(dto.voucherDate),
            description: dto.description ?? null,
            reference: dto.reference ?? null,
            totalDebit,
            totalCredit,
            entries: {
              create: dto.entries.map((e) => ({
                mainAccountId: e.mainAccountId,
                debit: Number(e.debit ?? 0),
                credit: Number(e.credit ?? 0),
                narration: e.narration ?? null,
              })),
            },
          },
          include: { entries: true },
        });
      });
      this.audit.record({
        userId: actorId,
        action: 'UPDATE',
        module: 'VOUCHER',
        entity: 'Voucher',
        entityId: id,
        message: `${voucher.voucherType} voucher ${voucher.number} updated`,
      });
      return updated;
    } catch (err) {
      throw err;
    }
  }

  async remove(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status !== 'draft') {
      throw ApiException.invalidTransaction(`Only draft vouchers can be deleted. "${voucher.number}" is ${voucher.status}.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
      await tx.voucher.delete({ where: { id } });
    });

    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'VOUCHER',
      entity: 'Voucher',
      entityId: id,
      message: `${voucher.voucherType} voucher ${voucher.number} deleted`,
    });
    return { id, deleted: true };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}