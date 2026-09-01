import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../common/services/inventory.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async overview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todaySalesAgg,
      todayPurchasesAgg,
      customerCount,
      supplierCount,
      productCount,
      recentSales,
      recentPurchases,
      recentVouchers,
      outstandingCustomers,
      outstandingSuppliers,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { status: 'posted', saleDate: { gte: today } },
        _sum: { grandTotal: true },
      }),
      this.prisma.purchase.aggregate({
        where: { status: 'posted', purchaseDate: { gte: today } },
        _sum: { grandTotal: true },
      }),
      this.prisma.customer.count({ where: { status: 'active' } }),
      this.prisma.supplier.count({ where: { status: 'active' } }),
      this.prisma.item.count({ where: { status: 'active' } }),
      this.prisma.sale.findMany({
        where: { status: 'posted' },
        include: { customer: true },
        orderBy: { saleDate: 'desc' },
        take: 8,
      }),
      this.prisma.purchase.findMany({
        where: { status: 'posted' },
        include: { supplier: true },
        orderBy: { purchaseDate: 'desc' },
        take: 8,
      }),
      this.prisma.voucher.findMany({
        where: { status: 'posted' },
        include: { createdBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.sumOutstandingCustomers(),
      this.sumOutstandingSuppliers(),
    ]);

    const stock = await this.inventory.totalStockValue();

    return {
      todaySales: round2(Number(todaySalesAgg._sum.grandTotal ?? 0)),
      todayPurchases: round2(Number(todayPurchasesAgg._sum.grandTotal ?? 0)),
      totalCustomers: customerCount,
      totalSuppliers: supplierCount,
      totalProducts: productCount,
      currentStockValue: round2(stock.totalValue),
      outstandingCustomerBalance: round2(outstandingCustomers),
      outstandingSupplierBalance: round2(outstandingSuppliers),
      recentSales,
      recentPurchases,
      recentVouchers,
    };
  }

  async salesTrend(days = 14) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));

    const [sales, purchases] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: 'posted', saleDate: { gte: from } },
        select: { saleDate: true, grandTotal: true },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.purchase.findMany({
        where: { status: 'posted', purchaseDate: { gte: from } },
        select: { purchaseDate: true, grandTotal: true },
        orderBy: { purchaseDate: 'asc' },
      }),
    ]);

    const points = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const daySales = sales
        .filter((s) => s.saleDate.toISOString().slice(0, 10) === key)
        .reduce((sum, s) => sum + Number(s.grandTotal), 0);
      const dayPurchases = purchases
        .filter((p) => p.purchaseDate.toISOString().slice(0, 10) === key)
        .reduce((sum, p) => sum + Number(p.grandTotal), 0);
      points.push({ date: key, sales: round2(daySales), purchases: round2(dayPurchases) });
    }
    return { days, points };
  }

  private async sumOutstandingCustomers(): Promise<number> {
    const customers = await this.prisma.customer.findMany({
      where: { status: 'active' },
      select: { id: true, openingBalance: true, mainAccountId: true },
    });
    let total = 0;
    for (const c of customers) {
      let balance = Number(c.openingBalance ?? 0);
      if (c.mainAccountId) {
        const agg = await this.prisma.voucherEntry.aggregate({
          where: { mainAccountId: c.mainAccountId, voucher: { status: 'posted' } },
          _sum: { debit: true, credit: true },
        });
        balance += Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
      }
      const salesAgg = await this.prisma.sale.aggregate({
        where: { customerId: c.id, status: 'posted' },
        _sum: { grandTotal: true, amountPaid: true },
      });
      const returnsAgg = await this.prisma.salesReturn.aggregate({
        where: { customerId: c.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      balance +=
        Number(salesAgg._sum.grandTotal ?? 0) -
        Number(returnsAgg._sum.grandTotal ?? 0) -
        Number(salesAgg._sum.amountPaid ?? 0);
      if (balance > 0) total += balance;
    }
    return total;
  }

  private async sumOutstandingSuppliers(): Promise<number> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { status: 'active' },
      select: { id: true, openingBalance: true, mainAccountId: true },
    });
    let total = 0;
    for (const s of suppliers) {
      let balance = Number(s.openingBalance ?? 0);
      if (s.mainAccountId) {
        const agg = await this.prisma.voucherEntry.aggregate({
          where: { mainAccountId: s.mainAccountId, voucher: { status: 'posted' } },
          _sum: { debit: true, credit: true },
        });
        balance += Number(agg._sum.credit ?? 0) - Number(agg._sum.debit ?? 0);
      }
      const purchasesAgg = await this.prisma.purchase.aggregate({
        where: { supplierId: s.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      const returnsAgg = await this.prisma.purchaseReturn.aggregate({
        where: { supplierId: s.id, status: 'posted' },
        _sum: { grandTotal: true },
      });
      balance += Number(purchasesAgg._sum.grandTotal ?? 0) - Number(returnsAgg._sum.grandTotal ?? 0);
      if (balance > 0) total += balance;
    }
    return total;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}