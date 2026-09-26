import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { AccountingService } from '../../common/services/accounting.service';
import { DefaultAccountsService } from '../../common/services/default-accounts.service';
import {
  DisbursePayrollDto,
  GeneratePayrollDto,
  UpdatePayrollItemsDto,
} from '../dto/hr.dto';
import { computePayrollLine, daysInMonth, round2 } from './payroll-calc';

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

    const [components, salaryLinks, loans] = await Promise.all([
      this.prisma.salaryComponent.findMany({ where: { status: 'active' }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.employeeSalaryComponent.findMany({
        include: { component: true },
      }),
      this.prisma.employeeLoan.findMany({ where: { status: 'active' } }),
    ]);

    const linksByEmployee = new Map<string, Map<string, number>>();
    for (const link of salaryLinks) {
      const m = linksByEmployee.get(link.employeeId) ?? new Map<string, number>();
      m.set(link.componentId, Number(link.amount));
      linksByEmployee.set(link.employeeId, m);
    }
    const loansByEmployee = new Map<string, number[]>();
    for (const loan of loans) {
      if (loan.startYear > periodYear || (loan.startYear === periodYear && loan.startMonth > periodMonth)) {
        continue;
      }
      const list = loansByEmployee.get(loan.employeeId) ?? [];
      list.push(Number(loan.installment));
      loansByEmployee.set(loan.employeeId, list);
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
      const employeeLinks = linksByEmployee.get(employee.id);
      const employeeComponents = components.map((c) => ({
        name: c.name,
        type: c.type as 'EARNING' | 'DEDUCTION',
        calcType: c.calcType as 'FIXED' | 'PERCENT_BASIC',
        value: Number(c.value),
        amount: employeeLinks?.get(c.id),
      }));
      return {
        employeeId: employee.id,
        ...computePayrollLine({
          basicSalary: Number(employee.basicSalary ?? 0),
          allowance: Number(employee.allowance ?? 0),
          attendance: attendanceOfEmployee,
          daysInMonth: totalDays,
          components: employeeComponents,
          loanInstallments: loansByEmployee.get(employee.id) ?? [],
        }),
      };
    });

    const run = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next('payroll', 'PAY', tx, 4, { year: false });
      const created = await tx.payrollRun.create({
        data: {
          number,
          periodMonth,
          periodYear,
          payDate: dto.payDate ? new Date(dto.payDate) : new Date(),
          note: dto.note ?? null,
          totalGross: lines.reduce((sum, l) => sum + l.grossPay, 0),
          totalDeduction: lines.reduce((sum, l) => sum + l.totalDeduction, 0),
          totalNet: lines.reduce((sum, l) => sum + l.netPay, 0),
        },
      });
      await tx.payrollItem.createMany({
        data: lines.map((l) => ({
          ...l,
          componentBreakdown: l.componentBreakdown.map((b) => ({ name: b.name, type: b.type, amount: b.amount })),
          payrollRunId: created.id,
        })),
      });
      const saved = await tx.payrollRun.findUnique({
        where: { id: created.id },
        include: {
          items: { include: { employee: { include: { department: true, designation: true } } } },
        },
      });
      return saved!;
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
    const voucherIds = Array.from(new Set(items.map((r) => r.voucherId).filter(Boolean) as string[]));
    const vouchers = voucherIds.length
      ? await this.prisma.voucher.findMany({ where: { id: { in: voucherIds } }, select: { id: true, number: true } })
      : [];
    const voucherNumber = new Map(vouchers.map((v) => [v.id, v.number]));
    const enriched = items.map((r) => ({
      id: r.id,
      number: r.number,
      periodMonth: r.periodMonth,
      periodYear: r.periodYear,
      periodLabel: this.periodLabel(r.periodMonth, r.periodYear),
      payDate: r.payDate,
      note: r.note,
      status: r.status,
      employeeCount: r._count.items,
      totalGross: r.totalGross,
      totalDeduction: r.totalDeduction,
      totalNet: r.totalNet,
      voucherId: r.voucherId,
      voucherNo: r.voucherId ? voucherNumber.get(r.voucherId) ?? null : null,
      disbursementVoucherId: r.disbursementVoucherId,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
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
    let voucherNo: string | null = null;
    if (item.voucherId) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { id: item.voucherId },
        select: { number: true },
      });
      voucherNo = voucher?.number ?? null;
    }
    return {
      ...item,
      periodLabel: this.periodLabel(item.periodMonth, item.periodYear),
      voucherNo,
    };
  }

  private async assertDraft(id: string) {
    const run = await this.findOne(id);
    if (run.status !== 'draft') {
      throw ApiException.invalidTransaction(`This payroll run is ${run.status} and can no longer be edited`);
    }
    return run;
  }

  /**
   * Header totals derived from the run's items. The items are the source of
   * truth: a stored `totalGross` / `totalDeduction` / `totalNet` that has
   * drifted (e.g. an older partial edit) would otherwise produce an unbalanced
   * voucher, since the debit side is always built from the item lines.
   */
  private itemTotals(items: { grossPay: unknown; totalDeduction: unknown; netPay: unknown }[]) {
    return {
      gross: round2(items.reduce((s, i) => s + Number(i.grossPay), 0)),
      deduction: round2(items.reduce((s, i) => s + Number(i.totalDeduction), 0)),
      net: round2(items.reduce((s, i) => s + Number(i.netPay), 0)),
    };
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

    // The run's header totals cover *every* employee on the run, not just the
    // rows this request touched — summing `updates` alone would replace a
    // 50-employee totalGross with the sum of the 3 edited lines.
    const updatedRun = await this.prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.payrollItem.update({ where: { id: u.id }, data: u.data });
      }
      const totals = await tx.payrollItem.aggregate({
        where: { payrollRunId: id },
        _sum: { grossPay: true, totalDeduction: true, netPay: true },
      });
      return tx.payrollRun.update({
        where: { id },
        data: {
          totalGross: round2(Number(totals._sum.grossPay ?? 0)),
          totalDeduction: round2(Number(totals._sum.totalDeduction ?? 0)),
          totalNet: round2(Number(totals._sum.netPay ?? 0)),
        },
        include: {
          items: {
            include: { employee: { include: { department: true, designation: true } } },
            orderBy: { employee: { code: 'asc' } },
          },
        },
      });
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

    const totals = this.itemTotals(run.items);
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
    if (!salaryExpenseId || !salariesPayableId || (totals.deduction > 0 && !deductionsPayableId)) {
      throw ApiException.invalidTransaction(
        'Salary expense / salaries payable accounts are not configured. Set them in Chart of Accounts defaults before posting payroll.',
      );
    }

    // Expense is split per department when the department has its own salary
    // expense account configured; otherwise it posts to the global default.
    const expenseAccounts = new Map<string, number>();
    const accountsById = new Map<string, string>();
    for (const item of run.items) {
      const accountId = item.employee.department?.salaryExpenseAccountId ?? salaryExpenseId;
      accountsById.set(accountId, item.employee.department?.name ?? 'General');
      expenseAccounts.set(accountId, (expenseAccounts.get(accountId) ?? 0) + Number(item.grossPay));
    }

    const entries: { mainAccountId: string; debit?: number; credit?: number; narration?: string }[] = [];
    for (const [accountId, amount] of expenseAccounts) {
      const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
      entries.push({
        mainAccountId: accountId,
        debit: rounded,
        narration: `Salary expense${accountsById.get(accountId) ? ` - ${accountsById.get(accountId)}` : ''}`,
      });
    }
    // Net pay is credited to each employee's own bound account when one is set;
    // employees without an account roll up to the global salaries payable.
    const unlinkedNet = run.items.reduce(
      (s, item) => (item.employee.mainAccountId ? s : s + Number(item.netPay)),
      0,
    );
    if (unlinkedNet > 0) {
      entries.push({
        mainAccountId: salariesPayableId,
        credit: Math.round((unlinkedNet + Number.EPSILON) * 100) / 100,
        narration: 'Net salaries payable',
      });
    }
    for (const item of run.items) {
      if (!item.employee.mainAccountId) continue;
      entries.push({
        mainAccountId: item.employee.mainAccountId,
        credit: Math.round((Number(item.netPay) + Number.EPSILON) * 100) / 100,
        narration: `Net pay - ${item.employee.fullName}`,
      });
    }
    if (totals.deduction > 0) {
      entries.push({
        mainAccountId: deductionsPayableId!,
        credit: totals.deduction,
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
        data: {
          status: 'posted',
          voucherId: voucher.id,
          postedById: actorId ?? null,
          postedAt: new Date(),
          // Repair the header to match the voucher that was just booked, so the
          // stored totals can never disagree with the posted voucher.
          totalGross: totals.gross,
          totalDeduction: totals.deduction,
          totalNet: totals.net,
        },
        include: { items: { include: { employee: true } } },
      });
    });

    this.audit.record({
      userId: actorId, action: 'POST', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} posted to accounting (voucher ${posted.voucherId})`,
    });
    return posted;
  }

  async disburse(id: string, dto: DisbursePayrollDto, actorId?: string) {
    const run = await this.findOne(id);
    if (run.status !== 'posted') {
      throw ApiException.invalidTransaction(`Only posted payroll runs can be disbursed (this one is ${run.status})`);
    }
    if (run.paidAt) {
      throw ApiException.invalidTransaction('This payroll has already been disbursed');
    }

    let bankMainAccountId: string | null = null;
    let bankName = '';
    if (dto.bankAccountId) {
      const bank = await this.prisma.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
        include: { mainAccount: true },
      });
      bankMainAccountId = bank?.mainAccountId ?? null;
      bankName = bank?.name ?? '';
    } else {
      const bank = await this.prisma.bankAccount.findFirst({
        where: { mainAccountId: { not: null }, status: 'active' },
        orderBy: { updatedAt: 'desc' },
        include: { mainAccount: true },
      });
      bankMainAccountId = bank?.mainAccountId ?? null;
      bankName = bank?.name ?? '';
    }
    if (!bankMainAccountId) {
      throw ApiException.invalidTransaction(
        'No bank account is linked to a chart-of-accounts entry. Link one in Accounts > Banks first.',
      );
    }

    const salariesPayableId = await this.defaultAccounts.resolveAccount(
      'accounting.salaries_payable_account',
      'Salaries Payable',
    );
    if (!salariesPayableId) {
      throw ApiException.invalidTransaction(
        'Salaries Payable account is not configured. Set it in Chart of Accounts defaults before disbursing payroll.',
      );
    }

    // The disbursement clears exactly what posting credited, so it uses the
    // same item-derived net rather than a possibly-drifted header total.
    const netAmount = this.itemTotals(run.items).net;
    const paid = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next('voucher_journal', 'JV', tx);
      const settlementEntries: { mainAccountId: string; debit?: number; credit?: number; narration?: string }[] = [];
      // Settle each employee's own bound account first; the rest clears the
      // global salaries payable account.
      const unlinkedNet = run.items.reduce(
        (s, item) => (item.employee.mainAccountId ? s : s + Number(item.netPay)),
        0,
      );
      if (unlinkedNet > 0) {
        settlementEntries.push({
          mainAccountId: salariesPayableId,
          debit: Math.round((unlinkedNet + Number.EPSILON) * 100) / 100,
          narration: 'Salaries settled',
        });
      }
      for (const item of run.items) {
        if (!item.employee.mainAccountId) continue;
        settlementEntries.push({
          mainAccountId: item.employee.mainAccountId,
          debit: Math.round((Number(item.netPay) + Number.EPSILON) * 100) / 100,
          narration: `Salary settled - ${item.employee.fullName}`,
        });
      }
      settlementEntries.push({
        mainAccountId: bankMainAccountId!,
        credit: netAmount,
        narration: 'Bank transfer',
      });
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: new Date(),
          description: `Salary disbursement - ${run.periodLabel}`,
          reference: `${run.number}-DISB`,
          entries: settlementEntries,
          createdById: actorId,
        },
        number,
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);
      return tx.payrollRun.update({
        where: { id },
        data: {
          paidAt: new Date(),
          disbursementVoucherId: voucher.id,
          note: run.note,
        },
      });
    });

    this.audit.record({
      userId: actorId, action: 'POST', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} disbursed${bankName ? ` via ${bankName}` : ''} (voucher ${paid.disbursementVoucherId})`,
    });
    return paid;
  }

  async exportBankFile(id: string) {
    const run = await this.findOne(id);
    if (run.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled payroll cannot be exported');
    }
    const lines: string[] = ['Employee Code,Employee Name,Bank Name,Account Number,Net Salary'];
    for (const item of run.items) {
      const emp = item.employee;
      const name = (emp.fullName ?? '').replaceAll('"', '""');
      const bank = (emp.bankName ?? '').replaceAll('"', '""');
      const account = (emp.bankAccount ?? '').replaceAll('"', '""');
      lines.push([
        `"${emp.code}"`,
        `"${name}"`,
        `"${bank}"`,
        `"${account}"`,
        Number(item.netPay).toFixed(2),
      ].join(','));
    }
    return {
      filename: `Salary_${run.number}.csv`,
      csv: lines.join('\n'),
    };
  }

  async reportRegister(year: number, month?: number) {
    const where: Record<string, unknown> = { periodYear: year };
    if (month) where.periodMonth = month;
    const runs = await this.prisma.payrollRun.findMany({
      where: { ...where, status: { not: 'cancelled' } },
      include: { _count: { select: { items: true } } },
      orderBy: { periodMonth: 'asc' },
    });
    const summary = runs.reduce(
      (acc, r) => ({
        gross: acc.gross + Number(r.totalGross),
        deduction: acc.deduction + Number(r.totalDeduction),
        net: acc.net + Number(r.totalNet),
        employees: acc.employees + r._count.items,
      }),
      { gross: 0, deduction: 0, net: 0, employees: 0 },
    );
    return {
      items: runs.map((r) => ({
        ...r,
        periodLabel: this.periodLabel(r.periodMonth, r.periodYear),
      })),
      summary,
    };
  }

  async reportDepartmentCost(year: number) {
    const items = await this.prisma.payrollItem.findMany({
      where: { payrollRun: { periodYear: year, status: { not: 'cancelled' } } },
      include: { employee: { include: { department: true } } },
    });
    const byDept = new Map<string, { deptId: string | null; deptName: string; gross: number; deduction: number; net: number }>();
    for (const item of items) {
      const dept = item.employee.department;
      const key = dept?.id ?? 'none';
      const row = byDept.get(key) ?? {
        deptId: dept?.id ?? null,
        deptName: dept?.name ?? 'Unassigned',
        gross: 0,
        deduction: 0,
        net: 0,
      };
      row.gross += Number(item.grossPay);
      row.deduction += Number(item.totalDeduction);
      row.net += Number(item.netPay);
      byDept.set(key, row);
    }
    const rows = Array.from(byDept.values())
      .map((r) => ({
        deptId: r.deptId,
        deptName: r.deptName,
        gross: Math.round((r.gross + Number.EPSILON) * 100) / 100,
        deduction: Math.round((r.deduction + Number.EPSILON) * 100) / 100,
        net: Math.round((r.net + Number.EPSILON) * 100) / 100,
      }))
      .sort((a, b) => b.net - a.net);
    const summary = rows.reduce(
      (acc, r) => ({ gross: acc.gross + r.gross, deduction: acc.deduction + r.deduction, net: acc.net + r.net }),
      { gross: 0, deduction: 0, net: 0 },
    );
    return { items: rows, summary, year };
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