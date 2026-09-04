import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateStockTransferDto } from './dto/inventory.dto';

@Injectable()
export class StockTransfersService {
  private readonly logger = new Logger(StockTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  async create(dto: CreateStockTransferDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.transferDate, 'Cannot create a stock transfer');
    this.validateLocations(dto);

    const number = await this.numbering.next('transfer', 'ST');

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          number,
          transferDate: new Date(dto.transferDate),
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          note: dto.note ?? null,
          status: 'draft',
          createdById: actorId,
          items: {
            create: dto.items.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity,
            })),
          },
        },
        include: { items: true, fromLocation: true, toLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'TRANSFER',
        entity: 'StockTransfer',
        entityId: transfer.id,
        message: `Stock transfer ${number} created (${dto.items.length} line(s))`,
      });
      return transfer;
    });
    return result;
  }

  async post(id: string, actorId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true, fromLocation: true, toLocation: true },
    });
    if (!transfer) throw ApiException.notFound('Stock transfer');
    if (transfer.status === 'posted') return transfer;
    if (transfer.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled transfer cannot be posted');
    }
    await this.fiscal.assertOpen(transfer.transferDate, 'Cannot post a stock transfer');
    if (transfer.fromLocationId === transfer.toLocationId) {
      throw ApiException.invalidTransaction('Source and destination locations cannot be the same');
    }

    const negativeSetting = await this.prisma.systemSetting.findFirst({
      where: { key: 'inventory.negative_stock' },
    });
    const allowNegative = negativeSetting?.value === 'true';

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Reduce source location stock for each item.
      for (const line of transfer.items) {
        try {
          await this.inventory.recordOut(
            tx,
            {
              itemId: line.itemId,
              locationId: transfer.fromLocationId,
              quantity: Number(line.quantity),
              transactionType: 'TRANSFER_OUT',
              referenceType: 'StockTransfer',
              referenceId: transfer.id,
              createdById: actorId,
            },
            { allowNegative },
          );
        } catch (err) {
          if ((err as Error).message.startsWith('ERR_INSUFFICIENT_STOCK')) {
            const item = await this.prisma.item.findUnique({ where: { id: line.itemId } });
            const available = await this.inventory.getBalance(line.itemId, transfer.fromLocationId, tx);
            throw ApiException.insufficientStock(
              item?.name ?? line.itemId,
              available,
              Number(line.quantity),
            );
          }
          throw err;
        }
      }

      // 2. Increase destination location stock.
      for (const line of transfer.items) {
        await this.inventory.recordIn(tx, {
          itemId: line.itemId,
          locationId: transfer.toLocationId,
          quantity: Number(line.quantity),
          transactionType: 'TRANSFER_IN',
          referenceType: 'StockTransfer',
          referenceId: transfer.id,
          createdById: actorId,
        });
      }

      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: 'posted' },
        include: { items: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'TRANSFER',
        entity: 'StockTransfer',
        entityId: transfer.id,
        message: `Stock transfer ${transfer.number} posted`,
      });
      return updated;
    });
    return result;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw ApiException.notFound('Stock transfer');
    await this.fiscal.assertOpen(transfer.transferDate, 'Cannot cancel a stock transfer');
    if (transfer.status === 'posted') {
      throw ApiException.invalidTransaction('Posted transfers cannot be cancelled. Create a reverse transfer.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'TRANSFER',
        entity: 'StockTransfer',
        entityId: id,
        message: `Stock transfer ${transfer.number} cancelled`,
        metadata: { reason },
      });
      return updated;
    });
    return result;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; from?: string; to?: string }) {
    const { page = 1, pageSize = 25, search, status, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { fromLocation: { name: { contains: search, mode: 'insensitive' } } },
        { toLocation: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (from || to) {
      where.transferDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: { fromLocation: true, toLocation: true, items: { include: { item: true } } },
        orderBy: { transferDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { fromLocation: true, toLocation: true, items: { include: { item: true } }, createdBy: { select: { id: true, fullName: true } } },
    });
    if (!transfer) throw ApiException.notFound('Stock transfer');
    return transfer;
  }

  private validateLocations(dto: CreateStockTransferDto) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw ApiException.invalidTransaction('Source and destination locations cannot be the same');
    }
    if (!dto.items || dto.items.length === 0) {
      throw ApiException.validation('At least one item is required');
    }
    for (const line of dto.items) {
      if (!Number(line.quantity) || Number(line.quantity) <= 0) {
        throw ApiException.validation('Quantity must be greater than zero');
      }
    }
  }
}