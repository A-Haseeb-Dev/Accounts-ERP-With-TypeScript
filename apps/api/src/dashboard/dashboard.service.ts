import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../common/services/inventory.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly defaultAccounts: DefaultAccountsService,
  ) {}

  async overview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const plus7 = new Date(today);
    plus7.setDate(plus7.getDate() + 7);
    plus7.setHours(23, 59, 59, 999);

    const [
      todaySalesAgg,
      todayPurchasesAgg,
      monthSalesAgg,
      monthPurchasesAgg,
      todayReceiptAgg,
      todayPaymentAgg,
      monthReceiptAgg,
      monthPaymentAgg,
      customerCount,
      supplierCount,
      productCount,
      recentSales,
      recentPurchases,
      recentVouchers,
      chequesInHand,
      chequesMaturing,
      chequesDueToday,
      bouncedCheques,
      overdueSales,
      returnsAgg,
      pendingReceipts,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { status: 'posted', saleDate: { gte: today } },
        _sum: { grandTotal: true },
      }),
      this.prisma.purchase.aggregate({
        where: { status: 'posted', purchaseDate: { gte: today } },
        _sum: { grandTotal: true },
      }),
      this.prisma.sale.aggregate({
        where: { status: 'posted', saleDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      this.prisma.purchase.aggregate({
        where: { status: 'posted', purchaseDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: { status: 'posted', paymentType: 'RECEIPT', paymentDate: { gte: today } },
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: { status: 'posted', paymentType: 'PAYMENT', paymentDate: { gte: today } },
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: { status: 'posted', paymentType: 'RECEIPT', paymentDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: { status: 'posted', paymentType: 'PAYMENT', paymentDate: { gte: monthStart } },
        _sum: { amount: true },
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
      this.prisma.paymentEntry.aggregate({
        where: {
          paymentType: 'RECEIPT',
          status: 'posted',
          chequeStatus: 'IN_HAND',
        },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: {
          paymentType: 'RECEIPT',
          status: 'posted',
          chequeStatus: 'IN_HAND',
          chequeDate: { gte: today, lte: plus7 },
        },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: {
          paymentType: 'RECEIPT',
          status: 'posted',
          chequeStatus: 'IN_HAND',
          chequeDate: { gte: today, lt: tomorrow },
        },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.paymentEntry.aggregate({
        where: { paymentType: 'RECEIPT', status: 'posted', chequeStatus: 'BOUNCED' },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.sale.findMany({
        where: { status: 'posted', dueDate: { lt: today } },
        select: { id: true, grandTotal: true, amountPaid: true },
      }),
      this.prisma.salesReturn.groupBy({
        by: ['saleId'],
        where: { status: 'posted' },
        _sum: { grandTotal: true },
      }),
      this.prisma.paymentEntry.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const stock = await this.inventory.totalStockValue();
    const cashAccount = await this.defaultAccounts.resolveAccount(
      'accounting.cash_account',
      'Cash Account',
    );
    const [cashBalance, bankBalance, lowStockCount, topCustomers, outstanding] = await Promise.all([
      this.accountBalance(cashAccount),
      this.totalBankBalance(),
      this.countLowStock(),
      this.topCustomers(),
      this.sumOutstanding(),
    ]);

    const returnedBySale = new Map(
      returnsAgg.map((r) => [r.saleId, Number(r._sum.grandTotal ?? 0)]),
    );
    let overdueCount = 0;
    let overdueAmount = 0;
    for (const s of overdueSales) {
      const outstandingAmt = round2(
        Number(s.grandTotal) - Number(s.amountPaid) - (returnedBySale.get(s.id) ?? 0),
      );
      if (outstandingAmt > 0) {
        overdueCount += 1;
        overdueAmount += outstandingAmt;
      }
    }

    return {
      todaySales: round2(Number(todaySalesAgg._sum.grandTotal ?? 0)),
      todayPurchases: round2(Number(todayPurchasesAgg._sum.grandTotal ?? 0)),
      monthSales: round2(Number(monthSalesAgg._sum.grandTotal ?? 0)),
      monthPurchases: round2(Number(monthPurchasesAgg._sum.grandTotal ?? 0)),
      todayReceipts: round2(Number(todayReceiptAgg._sum.amount ?? 0)),
      todayPayments: round2(Number(todayPaymentAgg._sum.amount ?? 0)),
      monthReceipts: round2(Number(monthReceiptAgg._sum.amount ?? 0)),
      monthPayments: round2(Number(monthPaymentAgg._sum.amount ?? 0)),
      cashBalance: round2(cashBalance),
      bankBalance: round2(bankBalance),
      totalCustomers: customerCount,
      totalSuppliers: supplierCount,
      totalProducts: productCount,
      currentStockValue: round2(stock.totalValue),
      outstandingCustomerBalance: round2(outstanding.customer),
      outstandingSupplierBalance: round2(outstanding.supplier),
      overdueInvoices: { count: overdueCount, amount: round2(overdueAmount) },
      chequesInHand: {
        count: chequesInHand._count,
        amount: round2(Number(chequesInHand._sum.amount ?? 0)),
      },
      chequesMaturingSoon: {
        count: chequesMaturing._count,
        amount: round2(Number(chequesMaturing._sum.amount ?? 0)),
      },
      chequesDueToday: {
        count: chequesDueToday._count,
        amount: round2(Number(chequesDueToday._sum.amount ?? 0)),
      },
      bouncedCheques: {
        count: bouncedCheques._count,
        amount: round2(Number(bouncedCheques._sum.amount ?? 0)),
      },
      lowStockCount,
      topCustomers,
      pendingReceipts,
      recentSales,
      recentPurchases,
      recentVouchers,
    };
  }

  async salesTrend(days = 14) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));

    const [sales, purchases, receipts, payments] = await Promise.all([
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
      this.prisma.paymentEntry.findMany({
        where: { status: 'posted', paymentType: 'RECEIPT', paymentDate: { gte: from } },
        select: { paymentDate: true, amount: true },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.paymentEntry.findMany({
        where: { status: 'posted', paymentType: 'PAYMENT', paymentDate: { gte: from } },
        select: { paymentDate: true, amount: true },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);

    const points = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const daySum = (rows: { paymentDate: Date; amount: unknown }[]) =>
        rows
          .filter((r) => r.paymentDate.toISOString().slice(0, 10) === key)
          .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      points.push({
        date: key,
        sales: round2(
          sales
            .filter((s) => s.saleDate.toISOString().slice(0, 10) === key)
            .reduce((sum, s) => sum + Number(s.grandTotal), 0),
        ),
        purchases: round2(
          purchases
            .filter((p) => p.purchaseDate.toISOString().slice(0, 10) === key)
            .reduce((sum, p) => sum + Number(p.grandTotal), 0),
        ),
        receipts: round2(daySum(receipts)),
        payments: round2(daySum(payments)),
      });
    }
    return { days, points };
  }

  private async accountBalance(mainAccountId: string | null): Promise<number> {
    if (!mainAccountId) return 0;
    const agg = await this.prisma.voucherEntry.aggregate({
      where: { mainAccountId, voucher: { status: 'posted' } },
      _sum: { debit: true, credit: true },
    });
    return Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
  }

  private async totalBankBalance(): Promise<number> {
    const banks = await this.prisma.bankAccount.findMany({
      where: { status: 'active', mainAccountId: { not: null } },
      select: { mainAccountId: true },
    });
    let total = 0;
    for (const bank of banks) {
      total += await this.accountBalance(bank.mainAccountId);
    }
    return total;
  }

  private async countLowStock(): Promise<number> {
    const agg = await this.prisma.inventoryTransaction.groupBy({
      by: ['itemId'],
      _sum: { quantityIn: true, quantityOut: true },
    });
    const balanceMap = new Map<string, number>();
    for (const row of agg) {
      balanceMap.set(
        row.itemId,
        Number(row._sum.quantityIn ?? 0) - Number(row._sum.quantityOut ?? 0),
      );
    }
    const items = await this.prisma.item.findMany({
      where: { status: 'active', minStockLevel: { gt: 0 } },
      select: { id: true, minStockLevel: true },
    });
    return items.filter((i) => (balanceMap.get(i.id) ?? 0) < Number(i.minStockLevel)).length;
  }

  private async topCustomers() {
    const groups = await this.prisma.sale.groupBy({
      by: ['customerId'],
      where: { status: 'posted' },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 5,
    });
    if (groups.length === 0) return [];
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: groups.map((g) => g.customerId) } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(customers.map((c) => [c.id, c.name]));
    return groups.map((g) => ({
      id: g.customerId,
      name: nameMap.get(g.customerId) ?? '-',
      total: round2(Number(g._sum.grandTotal ?? 0)),
    }));
  }

  private async sumOutstanding(): Promise<{ customer: number; supplier: number }> {
    return {
      customer: await this.sumOutstandingCustomers(),
      supplier: await this.sumOutstandingSuppliers(),
    };
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