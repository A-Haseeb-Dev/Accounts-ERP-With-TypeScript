import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Product ledger - stock movements with running balance per location. */
  async productLedger(query: { itemId: string; locationId?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const { itemId, locationId, from, to, page = 1, pageSize = 100 } = query;
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, include: { itemType: true, brand: true } });
    if (!item) throw ApiException.notFound('Item');

    const where: any = { itemId };
    if (locationId) where.locationId = locationId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const transactions = await this.prisma.inventoryTransaction.findMany({
      where,
      include: { location: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const total = transactions.length;
    const rows = transactions.map((t) => ({
      date: t.createdAt,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      transactionType: t.transactionType,
      location: t.location.name,
      stockIn: Number(t.quantityIn),
      stockOut: Number(t.quantityOut),
      balance: Number(t.balance),
      unitCost: Number(t.unitCost ?? 0),
    }));

    const paginated = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      item: { id: item.id, code: item.code, name: item.name, unit: item.unit, itemType: item.itemType?.name ?? null, brand: item.brand?.name ?? null },
      total,
      page,
      pageSize,
      rows: paginated,
    };
  }

  /** Total stock - quantity and value across locations. */
  async totalStock(query: { locationId?: string; itemTypeId?: string; brandId?: string }) {
    const { locationId, itemTypeId, brandId } = query;

    const where: any = { status: 'active' };
    if (itemTypeId) where.itemTypeId = itemTypeId;
    if (brandId) where.brandId = brandId;

    const items = await this.prisma.item.findMany({
      where,
      include: { itemType: true, brand: true },
      orderBy: { code: 'asc' },
    });

    const rows = [];
    let totalValue = 0;
    let totalQty = 0;

    for (const item of items) {
      const txnWhere: any = { itemId: item.id };
      if (locationId) txnWhere.locationId = locationId;
      const agg = await this.prisma.inventoryTransaction.aggregate({
        where: txnWhere,
        _sum: { quantityIn: true, quantityOut: true },
      });
      const qty = Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0);
      const value = qty * Number(item.purchasePrice);
      totalQty += qty;
      totalValue += value;
      rows.push({
        itemCode: item.code,
        itemName: item.name,
        itemId: item.id,
        unit: item.unit,
        itemType: item.itemType?.name ?? null,
        brand: item.brand?.name ?? null,
        quantity: qty,
        costPrice: Number(item.purchasePrice),
        salePrice: Number(item.salePrice),
        minStockLevel: Number(item.minStockLevel),
        stockValue: round2(value),
      });
    }

    return { rows, totalQty, totalValue: round2(totalValue) };
  }

  /** Category-wise stock (by item type). */
  async categoryWiseStock() {
    const itemTypes = await this.prisma.itemType.findMany({ include: { items: { where: { status: 'active' } } } });
    const rows = [];
    for (const type of itemTypes) {
      let qty = 0;
      let value = 0;
      for (const item of type.items) {
        const agg = await this.prisma.inventoryTransaction.aggregate({
          where: { itemId: item.id },
          _sum: { quantityIn: true, quantityOut: true },
        });
        const q = Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0);
        qty += q;
        value += q * Number(item.purchasePrice);
      }
      rows.push({ itemType: type.name, itemCount: type.items.length, quantity: qty, stockValue: round2(value) });
    }
    return { rows };
  }

  /** Customer-wise sales with returns. */
  async customerWiseSales(query: { customerId?: string; townId?: string; from?: string; to?: string }) {
    const { customerId, townId, from, to } = query;
    const whereCustomer: any = { status: 'active' };
    if (customerId) whereCustomer.id = customerId;
    if (townId) whereCustomer.townId = townId;
    const customers = await this.prisma.customer.findMany({ where: whereCustomer, orderBy: { name: 'asc' } });

    const rows = [];
    for (const customer of customers) {
      const saleWhere: any = { customerId: customer.id, status: 'posted' };
      const rtWhere: any = { customerId: customer.id, status: 'posted' };
      if (from || to) {
        saleWhere.saleDate = fromTo(from, to);
        rtWhere.returnDate = fromTo(from, to);
      }
      const sales = await this.prisma.sale.findMany({ where: saleWhere, orderBy: { saleDate: 'desc' } });
      const returnAgg = await this.prisma.salesReturn.aggregate({ where: rtWhere, _sum: { grandTotal: true } });
      const returnTotal = Number(returnAgg._sum.grandTotal ?? 0);
      const salesTotal = sales.reduce((s, sl) => s + Number(sl.grandTotal), 0);
      rows.push({
        customer: { id: customer.id, code: customer.code, name: customer.name },
        town: null,
        invoices: sales.map((s) => ({ number: s.number, date: s.saleDate, amount: Number(s.grandTotal) })),
        salesTotal: round2(salesTotal),
        returnTotal: round2(returnTotal),
        netSales: round2(salesTotal - returnTotal),
      });
    }
    return { rows };
  }

  /** Customer summary - totals per customer. */
  async customerSummary() {
    const customers = await this.prisma.customer.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } });
    const rows = [];
    for (const customer of customers) {
      const sales = await this.prisma.sale.aggregate({
        where: { customerId: customer.id, status: 'posted' },
        _sum: { grandTotal: true, amountPaid: true },
      });
      const returns = await this.prisma.salesReturn.aggregate({
        where: { customerId: customer.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      const totalSales = Number(sales._sum.grandTotal ?? 0);
      const totalReturns = Number(returns._sum.grandTotal ?? 0);
      const paid = Number(sales._sum.amountPaid ?? 0);
      const netSales = totalSales - totalReturns;
      rows.push({
        customer: { id: customer.id, code: customer.code, name: customer.name },
        totalSales: round2(totalSales),
        totalReturns: round2(totalReturns),
        netSales: round2(netSales),
        paid: round2(paid),
        outstanding: round2(netSales - paid),
      });
    }
    return { rows };
  }

  /** Sales return report. */
  async salesReturnReport(query: { from?: string; to?: string; customerId?: string }) {
    const { from, to, customerId } = query;
    const where: any = { status: 'posted' };
    if (customerId) where.customerId = customerId;
    if (from || to) where.returnDate = fromTo(from, to);

    const returns = await this.prisma.salesReturn.findMany({
      where,
      include: { customer: true, items: { include: { item: true } } },
      orderBy: { returnDate: 'desc' },
    });
    const total = returns.reduce((s, r) => s + Number(r.grandTotal), 0);
    return { rows: returns, total: round2(total) };
  }

  /** Sales book - all sales in range. */
  async salesBook(query: { from?: string; to?: string; customerId?: string; status?: string }) {
    const { from, to, customerId, status = 'posted' } = query;
    const where: any = { status };
    if (customerId) where.customerId = customerId;
    if (from || to) where.saleDate = fromTo(from, to);

    const sales = await this.prisma.sale.findMany({
      where,
      include: { customer: true, items: { include: { item: true } } },
      orderBy: { saleDate: 'desc' },
    });
    const subtotal = sales.reduce((s, sl) => s + Number(sl.subtotal), 0);
    const tax = sales.reduce((s, sl) => s + Number(sl.tax), 0);
    const grandTotal = sales.reduce((s, sl) => s + Number(sl.grandTotal), 0);
    return { rows: sales, subtotal: round2(subtotal), tax: round2(tax), grandTotal: round2(grandTotal) };
  }

  /** Purchase book - all purchases in range. */
  async purchaseBook(query: { from?: string; to?: string; supplierId?: string; status?: string }) {
    const { from, to, supplierId, status = 'posted' } = query;
    const where: any = { status };
    if (supplierId) where.supplierId = supplierId;
    if (from || to) where.purchaseDate = fromTo(from, to);

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: { supplier: true, items: { include: { item: true } } },
      orderBy: { purchaseDate: 'desc' },
    });
    const subtotal = purchases.reduce((s, p) => s + Number(p.subtotal), 0);
    const tax = purchases.reduce((s, p) => s + Number(p.tax), 0);
    const grandTotal = purchases.reduce((s, p) => s + Number(p.grandTotal), 0);
    return { rows: purchases, subtotal: round2(subtotal), tax: round2(tax), grandTotal: round2(grandTotal) };
  }

  /** Supplier purchase report. */
  async supplierPurchaseReport(query: { from?: string; to?: string; supplierId?: string }) {
    const { from, to, supplierId } = query;
    const where: any = { status: 'active' };
    if (supplierId) where.id = supplierId;
    const suppliers = await this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });

    const rows = [];
    for (const supplier of suppliers) {
      const purchaseWhere: any = { supplierId: supplier.id, status: 'posted' };
      const returnWhere: any = { supplierId: supplier.id, status: 'posted' };
      if (from || to) {
        purchaseWhere.purchaseDate = fromTo(from, to);
        returnWhere.returnDate = fromTo(from, to);
      }
      const purchaseAgg = await this.prisma.purchase.aggregate({ where: purchaseWhere, _sum: { grandTotal: true }, _count: true });
      const returnAgg = await this.prisma.purchaseReturn.aggregate({ where: returnWhere, _sum: { grandTotal: true } });
      const total = Number(purchaseAgg._sum.grandTotal ?? 0);
      const returns = Number(returnAgg._sum.grandTotal ?? 0);
      rows.push({
        supplier: { id: supplier.id, code: supplier.code, name: supplier.name },
        purchaseCount: purchaseAgg._count,
        totalPurchases: round2(total),
        purchaseReturns: round2(returns),
        netPurchase: round2(total - returns),
      });
    }
    return { rows };
  }

  /** Supplier summary. */
  async supplierSummary() {
    const suppliers = await this.prisma.supplier.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } });
    const rows = [];
    for (const supplier of suppliers) {
      const purchases = await this.prisma.purchase.aggregate({
        where: { supplierId: supplier.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      const returns = await this.prisma.purchaseReturn.aggregate({
        where: { supplierId: supplier.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      const totalPurchases = Number(purchases._sum.grandTotal ?? 0);
      const totalReturns = Number(returns._sum.grandTotal ?? 0);
      const netPurchase = totalPurchases - totalReturns;
      rows.push({
        supplier: { id: supplier.id, code: supplier.code, name: supplier.name },
        totalPurchases: round2(totalPurchases),
        returns: round2(totalReturns),
        paid: round2(0),
        outstanding: round2(netPurchase),
      });
    }
    return { rows };
  }
}

function fromTo(from?: string, to?: string) {
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}