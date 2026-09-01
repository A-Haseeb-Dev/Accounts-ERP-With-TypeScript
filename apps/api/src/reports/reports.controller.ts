import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as ExcelJS from 'exceljs';
import { AccountingReportsService } from './accounting-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly accounting: AccountingReportsService,
    private readonly inventory: InventoryReportsService,
  ) {}

  // ---------------- Accounting Reports ----------------

  @Get('general-ledger')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'General Ledger' })
  generalLedger(
    @Query('accountId') accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '100',
  ) {
    return this.accounting.generalLedger({ accountId, from, to, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get('general-journal')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'General Journal' })
  generalJournal(@Query('from') from?: string, @Query('to') to?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '100') {
    return this.accounting.generalJournal({ from, to, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get('trial-balance')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'Trial Balance' })
  trialBalance(@Query('asOf') asOf?: string) {
    return this.accounting.trialBalance({ asOf });
  }

  @Get('sub-head-trial')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'Sub Head Trial' })
  subHeadTrial(@Query('subHeadId') subHeadId: string, @Query('asOf') asOf?: string) {
    return this.accounting.subHeadTrial({ subHeadId, asOf });
  }

  @Get('town-wise-trial')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'Town Wise Trial' })
  townWiseTrial(@Query('townId') townId: string, @Query('asOf') asOf?: string) {
    return this.accounting.townWiseTrial({ townId, asOf });
  }

  @Get('account-list')
  @Permissions('reports.accounting.view')
  @ApiOperation({ summary: 'Account List (chart of accounts)' })
  accountList() {
    return this.accounting.accountList();
  }

  // ---------------- Inventory / Sales / Purchase Reports ----------------

  @Get('product-ledger')
  @Permissions('reports.inventory.view')
  @ApiOperation({ summary: 'Product Ledger' })
  productLedger(
    @Query('itemId') itemId: string,
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '100',
  ) {
    return this.inventory.productLedger({ itemId, locationId, from, to, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get('stock')
  @Permissions('reports.inventory.view')
  @ApiOperation({ summary: 'Total Stock Report' })
  totalStock(@Query('locationId') locationId?: string, @Query('itemTypeId') itemTypeId?: string, @Query('brandId') brandId?: string) {
    return this.inventory.totalStock({ locationId, itemTypeId, brandId });
  }

  @Get('category-stock')
  @Permissions('reports.inventory.view')
  @ApiOperation({ summary: 'Category Wise Stock Report' })
  categoryStock() {
    return this.inventory.categoryWiseStock();
  }

  @Get('customer-wise-sales')
  @Permissions('reports.sales.view')
  @ApiOperation({ summary: 'Customer Wise Sales' })
  customerWiseSales(@Query('customerId') customerId?: string, @Query('townId') townId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventory.customerWiseSales({ customerId, townId, from, to });
  }

  @Get('customer-summary')
  @Permissions('reports.sales.view')
  @ApiOperation({ summary: 'Customer Summary' })
  customerSummary() {
    return this.inventory.customerSummary();
  }

  @Get('sales-return')
  @Permissions('reports.sales.view')
  @ApiOperation({ summary: 'Sales Return Report' })
  salesReturnReport(@Query('from') from?: string, @Query('to') to?: string, @Query('customerId') customerId?: string) {
    return this.inventory.salesReturnReport({ from, to, customerId });
  }

  @Get('sales-book')
  @Permissions('reports.sales.view')
  @ApiOperation({ summary: 'Sales Book' })
  salesBook(@Query('from') from?: string, @Query('to') to?: string, @Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.inventory.salesBook({ from, to, customerId, status });
  }

  @Get('purchase-book')
  @Permissions('reports.purchase.view')
  @ApiOperation({ summary: 'Purchase Book' })
  purchaseBook(@Query('from') from?: string, @Query('to') to?: string, @Query('supplierId') supplierId?: string, @Query('status') status?: string) {
    return this.inventory.purchaseBook({ from, to, supplierId, status });
  }

  @Get('supplier-purchase')
  @Permissions('reports.purchase.view')
  @ApiOperation({ summary: 'Supplier Purchase Report' })
  supplierPurchase(@Query('from') from?: string, @Query('to') to?: string, @Query('supplierId') supplierId?: string) {
    return this.inventory.supplierPurchaseReport({ from, to, supplierId });
  }

  @Get('supplier-summary')
  @Permissions('reports.purchase.view')
  @ApiOperation({ summary: 'Supplier Summary' })
  supplierSummary() {
    return this.inventory.supplierSummary();
  }

  // ---------------- Export ----------------

  @Get('export/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="has-erp-report.xlsx"')
  @Permissions('reports.export')
  @ApiOperation({ summary: 'Export a report to Excel' })
  async exportExcel(
    @Res() res: Response,
    @Query('report') report: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('itemId') itemId?: string,
    @Query('accountId') accountId?: string,
    @Query('customerId') customerId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('locationId') locationId?: string,
  ) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.replace(/[^a-zA-Z0-9]/g, '_') || 'Report');

    ws.columns = [];
    let data: { rows: any[]; [key: string]: any } = { rows: [] };

    switch (report) {
      case 'general-ledger': {
        data = await this.accounting.generalLedger({ accountId: accountId ?? '', from, to, page: 1, pageSize: 100000 });
        ws.columns = [
          { header: 'Date', key: 'date', width: 14 }, { header: 'Voucher', key: 'voucherNumber', width: 14 },
          { header: 'Description', key: 'description', width: 40 }, { header: 'Debit', key: 'debit', width: 14 },
          { header: 'Credit', key: 'credit', width: 14 }, { header: 'Balance', key: 'balance', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow({ ...r, date: new Date(r.date).toLocaleDateString() }));
        break;
      }
      case 'trial-balance': {
        data = await this.accounting.trialBalance({ asOf: undefined });
        ws.columns = [
          { header: 'Code', key: 'code', width: 12 }, { header: 'Account', key: 'name', width: 40 },
          { header: 'Type', key: 'accountType', width: 14 }, { header: 'Debit', key: 'debit', width: 14 },
          { header: 'Credit', key: 'credit', width: 14 }, { header: 'Balance', key: 'balance', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow(r));
        break;
      }
      case 'stock': {
        data = await this.inventory.totalStock({ locationId });
        ws.columns = [
          { header: 'Code', key: 'itemCode', width: 12 }, { header: 'Item', key: 'itemName', width: 40 },
          { header: 'Type', key: 'itemType', width: 14 }, { header: 'Brand', key: 'brand', width: 14 },
          { header: 'Qty', key: 'quantity', width: 12 }, { header: 'Cost', key: 'costPrice', width: 12 },
          { header: 'Value', key: 'stockValue', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow(r));
        break;
      }
      case 'sales-book': {
        data = await this.inventory.salesBook({ from, to });
        ws.columns = [
          { header: 'Number', key: 'number', width: 14 }, { header: 'Date', key: 'saleDate', width: 14 },
          { header: 'Customer', key: 'customer', width: 30 }, { header: 'Subtotal', key: 'subtotal', width: 14 },
          { header: 'Tax', key: 'tax', width: 14 }, { header: 'Total', key: 'grandTotal', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow({ ...r, saleDate: new Date(r.saleDate).toLocaleDateString(), customer: r.customer?.name ?? '' }));
        break;
      }
      case 'purchase-book': {
        data = await this.inventory.purchaseBook({ from, to });
        ws.columns = [
          { header: 'Number', key: 'number', width: 14 }, { header: 'Date', key: 'purchaseDate', width: 14 },
          { header: 'Supplier', key: 'supplier', width: 30 }, { header: 'Subtotal', key: 'subtotal', width: 14 },
          { header: 'Tax', key: 'tax', width: 14 }, { header: 'Total', key: 'grandTotal', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow({ ...r, purchaseDate: new Date(r.purchaseDate).toLocaleDateString(), supplier: r.supplier?.name ?? '' }));
        break;
      }
      case 'customer-summary': {
        data = await this.inventory.customerSummary();
        ws.columns = [
          { header: 'Code', key: 'code', width: 12 }, { header: 'Customer', key: 'name', width: 30 },
          { header: 'Sales', key: 'totalSales', width: 14 }, { header: 'Returns', key: 'totalReturns', width: 14 },
          { header: 'Net', key: 'netSales', width: 14 }, { header: 'Paid', key: 'paid', width: 14 },
          { header: 'Outstanding', key: 'outstanding', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow({ code: r.customer.code, name: r.customer.name, ...r }));
        break;
      }
      case 'supplier-summary': {
        data = await this.inventory.supplierSummary();
        ws.columns = [
          { header: 'Code', key: 'code', width: 12 }, { header: 'Supplier', key: 'name', width: 30 },
          { header: 'Purchases', key: 'totalPurchases', width: 14 }, { header: 'Returns', key: 'returns', width: 14 },
          { header: 'Outstanding', key: 'outstanding', width: 14 },
        ];
        data.rows.forEach((r) => ws.addRow({ code: r.supplier.code, name: r.supplier.name, ...r }));
        break;
      }
      default:
        ws.addRow(['Unknown report type']);
    }

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  }
}