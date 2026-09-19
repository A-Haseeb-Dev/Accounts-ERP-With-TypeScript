import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { AccountingService } from '../../common/services/accounting.service';
import { DefaultAccountsService } from '../../common/services/default-accounts.service';
import { GeneratePayrollDto, UpdatePayrollItemsDto } from '../dto/hr.dto';
import { computePayrollLine, daysInMonth } from './payroll-calc';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
  ) {}

  previewCode() {
    return this.numbering.preview('payroll', 'PAY', 4, { year: false });
  }

  private periodLabel(month: number, year: number) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  async generate(dto: GeneratePayrollDto, actorId?: string) {
    const { periodMonth, periodYear } = dto;
    if (periodMonth < 1 || periodMonth > 12) {
      throw ApiException.validation('Period month must be between 1 and 12');
    }
    const existing = await this.prisma.payrollRun.findFirst({
      where: { periodMonth, periodYear, status: { not: 'cancelled' } },
    });
    if (existing) {
      throw ApiException.conflict(
        `Payroll for ${this.periodLabel(periodMonth, periodYear)} already exists (${existing.number}). Cancel it first or use a different period.`,
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: { status: 'active' },
      orderBy: { code: 'asc' },
    });
    if (employees.length === 0) {
      throw ApiException.invalidTransaction('No active employees to include in the payroll run');
    }

    const start = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
    const end = new Date(Date.UTC(periodYear, periodMonth, 0, 23, 59, 59, 999));
    const attendance = await this.prisma.hrAttendance.findMany({
      where: { date: { gte: start, lte: end } },
      select: { employeeId: true, status: true, overtimeHours: true },
    });
    const attendanceByEmployee = new Map<string, typeof attendance>();
    for (const row of attendance) {
      const list = attendanceByEmployee.get(row.employeeId) ?? [];
      list.push(row);
      attendanceByEmployee.set(row.employeeId, list);
    }

    const totalDays = daysInMonth(periodMonth, periodYear);
    const lines = employees.map((employee) => {
      const attendanceOfEmployee = (attendanceByEmployee.get(employee.id) ?? []).map((a) => ({
        status: a.status,
        overtimeHours: Number(a.overtimeHours),
      }));
      return {
        employeeId: employee.id,
        ...computePayrollLine({
          basicSalary: Number(employee.basicSalary ?? 0),
          allowance: Number(employee.allowance ?? 0),
          attendance: attendanceOfEmployee,
          daysInMonth: totalDays,
        }),
      };
    });

    const run = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next('payroll', 'PAY', tx, 4, { year: false });
      return tx.payrollRun.create({
        data: {
          number,
          periodMonth,
          periodYear,
          payDate: dto.payDate ? new Date(dto.payDate) : new Date(),
          note: dto.note ?? null,
          totalGross: lines.reduce((sum, l) => sum + l.grossPay, 0),
          totalDeduction: lines.reduce((sum, l) => sum + l.totalDeduction, 0),
          totalNet: lines.reduce((sum, l) => sum + l.netPay, 0),
          items: { create: lines },
        },
        include: { items: { include: { employee: { include: { department: true, designation: true } } } } },
      });
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Payroll',
      entityId: run.id, message: `Payroll ${run.number} generated for ${this.periodLabel(periodMonth, periodYear)}`,
    });
    return run;
  }

  async findAll(query: { page?: number; pageSize?: number; status?: string; year?: string; month?: string }) {
    const { page = 1, pageSize = 25, status, year, month } = query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (year) where.periodYear = Number(year);
    if (month) where.periodMonth = Number(month);

    const [items, total] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payrollRun.count({ where }),
    ]);
    const enriched = items.map((r) => ({
      ...r,
      periodLabel: this.periodLabel(r.periodMonth, r.periodYear),
    }));
    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const item = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        items: {
          include: { employee: { include: { department: true, designation: true } } },
          orderBy: { employee: { code: 'asc' } },
        },
      },
    });
    if (!item) throw ApiException.notFound('Payroll run');
    return { ...item, periodLabel: this.periodLabel(item.periodMonth, item.periodYear) };
  }

  private async assertDraft(id: string) {
    const run = await this.findOne(id);
    if (run.status !== 'draft') {
      throw ApiException.invalidTransaction(`This payroll run is ${run.status} and can no longer be edited`);
    }
    return run;
  }

  async updateItems(id: string, dto: UpdatePayrollItemsDto, actorId?: string) {
    const run = await this.assertDraft(id);
    const existing = new Map(run.items.map((i) => [i.id, i]));
    const totalDays = daysInMonth(run.periodMonth, run.periodYear);

    const updates = dto.items.map((change) => {
      const item = existing.get(change.id);
      if (!item) throw ApiException.notFound('Payroll item');
      const basic = Number(item.basic);
      const allowance = Number(item.allowance);
      const overtimeHours = change.overtimeHours ?? Number(item.overtimeHours);
      const hourlyRate = basic > 0 ? basic / (totalDays * 8) : 0;
      const overtimeAmount = Math.round((overtimeHours * hourlyRate + Number.EPSILON) * 100) / 100;
      const otherDeduction = change.otherDeduction ?? Number(item.otherDeduction);
      const taxDeduction = change.taxDeduction ?? Number(item.taxDeduction);
      const grossPay = Math.round((basic + allowance + overtimeAmount + Number.EPSILON) * 100) / 100;
      const totalDeduction = Math.round(
        (Number(item.absentDeduction) + otherDeduction + taxDeduction + Number.EPSILON) * 100,
      ) / 100;
      const netPay = Math.round((grossPay - totalDeduction + Number.EPSILON) * 100) / 100;
      return {
        id: item.id,
        data: {
          overtimeHours,
          overtimeAmount,
          otherDeduction,
          taxDeduction,
          grossPay,
          totalDeduction,
          netPay,
        },
      };
    });

    const updatedItems = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const u of updates) {
        results.push(await tx.payrollItem.update({ where: { id: u.id }, data: u.data }));
      }
      return results;
    });

    const gross = updatedItems.reduce((s, i) => s + Number(i.grossPay), 0);
    const deduction = updatedItems.reduce((s, i) => s + Number(i.totalDeduction), 0);
    const net = updatedItems.reduce((s, i) => s + Number(i.netPay), 0);
    const updatedRun = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        totalGross: Math.round((gross + Number.EPSILON) * 100) / 100,
        totalDeduction: Math.round((deduction + Number.EPSILON) * 100) / 100,
        totalNet: Math.round((net + Number.EPSILON) * 100) / 100,
      },
      include: {
        items: {
          include: { employee: { include: { department: true, designation: true } } },
          orderBy: { employee: { code: 'asc' } },
        },
      },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} items updated`,
    });
    return updatedRun;
  }

  async post(id: string, actorId?: string) {
    const run = await this.findOne(id);
    if (run.status !== 'draft') {
      throw ApiException.invalidTransaction(`Only draft payroll runs can be posted (this one is ${run.status})`);
    }

    const salaryExpenseId = await this.defaultAccounts.resolveAccount(
      'accounting.salary_expense_account',
      'Salary Expense',
    );
    const salariesPayableId = await this.defaultAccounts.resolveAccount(
      'accounting.salaries_payable_account',
      'Salaries Payable',
    );
    const deductionsPayableId = await this.defaultAccounts.resolveAccount(
      'accounting.payroll_deductions_account',
      'Payroll Deductions Payable',
    );
    if (!salaryExpenseId || !salariesPayableId || (Number(run.totalDeduction) > 0 && !deductionsPayableId)) {
      throw ApiException.invalidTransaction(
        'Salary expense / salaries payable accounts are not configured. Set them in Chart of Accounts defaults before posting payroll.',
      );
    }

    const entries: { mainAccountId: string; debit?: number; credit?: number; narration?: string }[] = [
      {
        mainAccountId: salaryExpenseId,
        debit: Number(run.totalGross),
        narration: `Salary expense - ${run.periodLabel}`,
      },
      {
        mainAccountId: salariesPayableId,
        credit: Number(run.totalNet),
        narration: 'Net salaries payable',
      },
    ];
    if (Number(run.totalDeduction) > 0) {
      entries.push({
        mainAccountId: deductionsPayableId!,
        credit: Number(run.totalDeduction),
        narration: 'Payroll deductions',
      });
    }

    const posted = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next('voucher_journal', 'JV', tx);
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: run.payDate,
          description: `Payroll for ${run.periodLabel}`,
          reference: run.number,
          entries,
          createdById: actorId,
        },
        number,
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);
      return tx.payrollRun.update({
        where: { id },
        data: { status: 'posted', voucherId: voucher.id, postedById: actorId ?? null, postedAt: new Date() },
        include: { items: { include: { employee: true } } },
      });
    });

    this.audit.record({
      userId: actorId, action: 'POST', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} posted to accounting (voucher ${posted.voucherId})`,
    });
    return posted;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const run = await this.findOne(id);
    if (run.status !== 'posted') {
      throw ApiException.invalidTransaction(`Only posted payroll runs can be cancelled (this one is ${run.status})`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (run.voucherId) {
        await this.accounting.cancelVoucher(tx, run.voucherId, `Payroll cancelled: ${reason}`, actorId);
      }
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      });
    });

    this.audit.record({
      userId: actorId, action: 'CANCEL', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} cancelled`,
    });
    return { id, status: 'cancelled' };
  }

  async remove(id: string, actorId?: string) {
    const run = await this.findOne(id);
    if (run.status !== 'draft') {
      throw ApiException.invalidTransaction('Only draft payroll runs can be deleted');
    }
    await this.prisma.payrollRun.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} deleted`,
    });
    return { id, deleted: true };
  }
}