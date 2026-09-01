import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateItemDto, UpdateItemDto } from '../dto/products.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateItemDto, actorId?: string) {
    const existing = await this.prisma.item.findUnique({ where: { code: dto.code } });
    if (existing) throw ApiException.duplicateCode('Item code');
    if (dto.barcode) {
      const byBarcode = await this.prisma.item.findUnique({ where: { barcode: dto.barcode } });
      if (byBarcode) throw ApiException.duplicateCode('Barcode');
    }

    const item = await this.prisma.item.create({
      data: {
        code: dto.code,
        barcode: dto.barcode ?? null,
        name: dto.name,
        unit: dto.unit ?? 'pcs',
        purchasePrice: dto.purchasePrice ?? 0,
        salePrice: dto.salePrice ?? 0,
        minStockLevel: dto.minStockLevel ?? 0,
        description: dto.description ?? null,
        itemTypeId: dto.itemTypeId ?? null,
        brandId: dto.brandId ?? null,
        defaultLocationId: dto.defaultLocationId ?? null,
        status: dto.status ?? 'active',
      },
      include: { itemType: true, brand: true, defaultLocation: true },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'ITEM', entity: 'Item',
      entityId: item.id, message: `Item ${item.name} (${item.code}) created`,
    });

    return item;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    itemTypeId?: string; brandId?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, itemTypeId, brandId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (itemTypeId) where.itemTypeId = itemTypeId;
    if (brandId) where.brandId = brandId;

    const items = await this.prisma.item.findMany({
      where,
      include: {
        itemType: true,
        brand: true,
        defaultLocation: true,
      },
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const total = await this.prisma.item.count({ where });

    const itemIds = items.map((i) => i.id);
    const stockAgg = await this.prisma.inventoryTransaction.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds } },
      _sum: { quantityIn: true, quantityOut: true },
    });

    const stockMap = new Map(stockAgg.map((s) => [s.itemId, s._sum]));

    const enriched = items.map((item) => {
      const sums = stockMap.get(item.id);
      const totalIn = Number(sums?.quantityIn ?? 0);
      const totalOut = Number(sums?.quantityOut ?? 0);
      const currentStock = totalIn - totalOut;
      return {
        ...item,
        currentStock,
        stockValue: currentStock * Number(item.purchasePrice),
        minStock: Number(item.minStockLevel),
      };
    });

    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async searchItems(query: { search?: string; limit?: number }) {
    const { search = '', limit = 10 } = query;
    const items = await this.prisma.item.findMany({
      where: {
        status: 'active',
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      },
      include: { defaultLocation: true },
      orderBy: { name: 'asc' },
      take: Math.min(limit, 50),
    });

    return Promise.all(
      items.map(async (item) => {
        const transactions = await this.prisma.inventoryTransaction.aggregate({
          where: { itemId: item.id },
          _sum: { quantityIn: true, quantityOut: true },
        });
        const stock = Number(transactions._sum.quantityIn ?? 0) - Number(transactions._sum.quantityOut ?? 0);
        return { ...item, currentStock: stock };
      }),
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { itemType: true, brand: true, defaultLocation: true },
    });
    if (!item) throw ApiException.notFound('Item');

    const transactions = await this.prisma.inventoryTransaction.aggregate({
      where: { itemId: id },
      _sum: { quantityIn: true, quantityOut: true },
    });
    const currentStock = Number(transactions._sum.quantityIn ?? 0) - Number(transactions._sum.quantityOut ?? 0);

    return { ...item, currentStock, stockValue: currentStock * Number(item.purchasePrice) };
  }

  async findStockByLocation(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');

    const locations = await this.prisma.stockLocation.findMany({ where: { status: 'active' } });
    const result = [];
    for (const loc of locations) {
      const agg = await this.prisma.inventoryTransaction.aggregate({
        where: { itemId: id, locationId: loc.id },
        _sum: { quantityIn: true, quantityOut: true },
      });
      result.push({
        location: loc,
        stock: Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0),
      });
    }
    return result;
  }

  async findLedger(id: string, query: { page?: number; pageSize?: number; from?: string; to?: string }) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');

    const { page = 1, pageSize = 25, from, to } = query;
    const where: Record<string, unknown> = { itemId: id };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const transactions = await this.prisma.inventoryTransaction.findMany({
      where,
      include: { location: true },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = pageSize > 0 ? transactions.slice((page - 1) * pageSize, page * pageSize) : transactions;

    return {
      item,
      total: transactions.length,
      page,
      pageSize,
      totalPages: Math.ceil(transactions.length / pageSize),
      entries: filtered,
    };
  }

  async update(id: string, dto: UpdateItemDto, actorId?: string) {
    await this.findOne(id);
    if (dto.code) {
      const byCode = await this.prisma.item.findUnique({ where: { code: dto.code } });
      if (byCode && byCode.id !== id) throw ApiException.duplicateCode('Item code');
    }
    const item = await this.prisma.item.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'ITEM', entity: 'Item',
      entityId: id, message: `Item ${item.name} updated`,
      metadata: { fields: Object.keys(dto) },
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findItem(id);
    const txnCount = await this.prisma.inventoryTransaction.count({ where: { itemId: id } });
    if (txnCount > 0) {
      throw ApiException.invalidTransaction(
        `Item "${item.name}" has inventory movement and cannot be deleted. Deactivate it instead.`,
      );
    }
    await this.prisma.item.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: 'ITEM', entity: 'Item',
      entityId: id, message: `Item ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }

  private async findItem(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');
    return item;
  }
}