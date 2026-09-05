import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';

/**
 * Generic CRUD for simple single-entity master data
 * (ItemType, Brand, StockLocation).
 */
@Injectable()
export class SimpleMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolveDelegate(model: 'itemType' | 'brand' | 'stockLocation') {
    switch (model) {
      case 'itemType':
        return this.prisma.itemType;
      case 'brand':
        return this.prisma.brand;
      case 'stockLocation':
        return this.prisma.stockLocation;
      default:
        throw new Error('Unknown model');
    }
  }

  private entityLabel(model: string): string {
    switch (model) {
      case 'itemType': return 'Item type';
      case 'brand': return 'Brand';
      case 'stockLocation': return 'Stock location';
      default: return 'Record';
    }
  }

  private async checkUnique(model: string, name: string) {
    const delegate = this.resolveDelegate(model as any) as any;
    const existing = await delegate.findFirst({ where: { name } });
    if (existing) throw ApiException.duplicateCode('Name');
  }

  async create(model: 'itemType' | 'brand' | 'stockLocation', dto: { code?: string; name: string; description?: string; status?: string }, actorId?: string) {
    await this.checkUnique(model, dto.name);
    if (model === 'stockLocation' && dto.code) {
      const existing = await (this.resolveDelegate(model) as any).findUnique({ where: { code: dto.code } });
      if (existing) throw ApiException.duplicateCode('Location code');
    }
    const delegate = this.resolveDelegate(model) as any;
    const item = await delegate.create({
      data: {
        ...(dto.code ? { code: dto.code } : {}),
        name: dto.name,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: model.toUpperCase(), entity: this.entityLabel(model),
      entityId: item.id, message: `${this.entityLabel(model)} ${item.name} created`,
    });
    return item;
  }

  async findAll(model: 'itemType' | 'brand' | 'stockLocation', query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const delegate = this.resolveDelegate(model) as any;
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        ...(model === 'stockLocation' ? [{ code: { contains: search, mode: 'insensitive' } }] : []),
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      delegate.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      delegate.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat(model: 'itemType' | 'brand' | 'stockLocation', activeOnly = false) {
    const delegate = this.resolveDelegate(model) as any;
    return delegate.findMany({
      where: activeOnly ? { status: 'active' } : {},
      orderBy: { name: 'asc' },
    });
  }

  async findOne(model: 'itemType' | 'brand' | 'stockLocation', id: string) {
    const delegate = this.resolveDelegate(model) as any;
    const item = await delegate.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound(this.entityLabel(model));
    return item;
  }

  async update(model: 'itemType' | 'brand' | 'stockLocation', id: string, dto: Record<string, any>, actorId?: string) {
    const delegate = this.resolveDelegate(model) as any;
    await this.findOne(model, id);
    const item = await delegate.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: model.toUpperCase(), entity: this.entityLabel(model),
      entityId: id, message: `${this.entityLabel(model)} ${item.name} updated`,
    });
    return item;
  }

  async remove(model: 'itemType' | 'brand' | 'stockLocation', id: string, actorId?: string, force = false) {
    const delegate = this.resolveDelegate(model) as any;
    const item = await delegate.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound(this.entityLabel(model));
    const label = this.entityLabel(model);

    if (model === 'stockLocation') {
      const references = await this.stockLocationReferences(id);
      if (references.length > 0) {
        throw ApiException.deleteBlocked(`Stock location "${item.name}"`, references);
      }
    } else {
      const column = model === 'itemType' ? 'itemTypeId' : 'brandId';
      const count = await this.prisma.item.count({ where: { [column]: id } });
      if (count > 0 && !force) {
        throw ApiException.referencesExist(`${label} "${item.name}"`, [
          `${count} item${count === 1 ? '' : 's'}`,
        ]);
      }
    }

    await delegate.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: model.toUpperCase(), entity: label,
      entityId: id, message: `${label} ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  private async stockLocationReferences(id: string): Promise<string[]> {
    const [items, purchases, sales, purchaseReturns, salesReturns, transfers, transactions] =
      await Promise.all([
        this.prisma.item.count({ where: { defaultLocationId: id } }),
        this.prisma.purchase.count({ where: { stockLocationId: id } }),
        this.prisma.sale.count({ where: { stockLocationId: id } }),
        this.prisma.purchaseReturn.count({ where: { stockLocationId: id } }),
        this.prisma.salesReturn.count({ where: { stockLocationId: id } }),
        this.prisma.stockTransfer.count({
          where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
        }),
        this.prisma.inventoryTransaction.count({ where: { locationId: id } }),
      ]);
    const references: string[] = [];
    if (items) references.push(`${items} linked item${items === 1 ? '' : 's'}`);
    if (purchases) references.push(`${purchases} purchase${purchases === 1 ? '' : 's'}`);
    if (sales) references.push(`${sales} sale${sales === 1 ? '' : 's'}`);
    if (purchaseReturns) references.push(`${purchaseReturns} purchase return${purchaseReturns === 1 ? '' : 's'}`);
    if (salesReturns) references.push(`${salesReturns} sales return${salesReturns === 1 ? '' : 's'}`);
    if (transfers) references.push(`${transfers} stock transfer${transfers === 1 ? '' : 's'}`);
    if (transactions) references.push(`${transactions} inventory movement${transactions === 1 ? '' : 's'}`);
    return references;
  }
}