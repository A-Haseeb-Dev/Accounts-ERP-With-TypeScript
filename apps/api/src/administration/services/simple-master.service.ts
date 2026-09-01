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

  async remove(model: 'itemType' | 'brand' | 'stockLocation', id: string, actorId?: string) {
    const delegate = this.resolveDelegate(model) as any;
    const item = await delegate.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound(this.entityLabel(model));

    const usage: Record<string, [string, string]> = {
      itemType: ['item', 'itemTypeId'],
      brand: ['item', 'brandId'],
      stockLocation: ['item', 'defaultLocationId'],
    };
    const [table, column] = usage[model];
    const count = await (this.prisma as any)[table].count({ where: { [column]: id } });
    if (count > 0) {
      throw ApiException.invalidTransaction(
        `${this.entityLabel(model)} "${item.name}" is used by ${count} item(s) and cannot be deleted`,
      );
    }

    await delegate.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: model.toUpperCase(), entity: this.entityLabel(model),
      entityId: id, message: `${this.entityLabel(model)} ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }
}