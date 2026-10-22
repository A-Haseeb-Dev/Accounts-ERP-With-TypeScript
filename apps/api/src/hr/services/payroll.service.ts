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

  /**
   * Resolves the account a run's salaries are funded from.
   *
   * A run-level choice wins; otherwise the company-wide default set in
   * Settings > Accounting (`accounting.payroll_funding_account`) applies. An
   * explicitly chosen account that is missing or inactive is a hard error -
   * silently falling back to the default would book the run against an account
   * the operator did not pick.
   */
  private async resolveFundingAccount(preferredId?: string | null) {
    if (preferredId) {
      const account = await this.prisma.mainAccount.findFirst({
        where: { id: preferredId, status: 'active' },
        select: { id: true, code: true, name: true },
      });
      if (!account) {
        throw ApiException.validation('The selected payroll funding account was not found or is inactive.');
      }
      return account;
    }
    const configuredId = await this.defaultAccounts.resolveAccount('accounting.payroll_funding_account');
    if (!configuredId) return null;
    return this.prisma.mainAccount.findFirst({
      where: { id: configuredId, status: 'active' },
      select: { id: true, code: true, name: true },
    });
  }

  /**
   * Refuses the run unless the funding account can cover the total net pay.
   *
   * This is the guard behind "distribute only as much salary as the account
   * holds": reaching beyond the balance is stopped here rather than at payment
   * time, so the operator tops the account up (from another account) first.
   */
  private async assertFundingBalance(
    funding: { id: string; code: string; name: string },
    totalNet: number,
  ) {
    const balance = round2(await this.accounting.accountBalance(funding.id));
    const required = round2(totalNet);
    if (required > balance) {
      throw ApiException.invalidTransaction(
        `Not enough balance in payroll funding account "${funding.name} (${funding.code})". ` +
          `Available ${balance.toFixed(2)}, required ${required.toFixed(2)}. ` +
          'Transfer funds into it or choose another funding account.',
      );
    }
  }

  /**
   * Builds the payroll lines for a period from the live HR data: attendance,
   * the salary structure, the active salary components and the loan
   * installments falling due that month.
   *
   * This is the one place a payroll line is derived, so generating a run and
   * recalculating a draft read exactly the same figures - a run cannot
   * disagree with the attendance and salary it claims to be based on.
   */
  private async computeLines(employees: any[], periodMonth: number, periodYear: number) {
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
    return { lines, totalDays };
  }

  /**
   * Resolves the account a run's money is actually paid out of.
   *
   * The funding account is the default, because that is the pot the operator
   * filled in order to pay the salaries: the money that leaves must be the
   * money they set aside. A different account can be named for the cases where
   * the payment genuinely goes out of a different bank, but then that account
   * is the one whose balance is checked and reduced.
   */
  private async resolveSettlementAccount(
    funding: { id: string; code: string; name: string } | null,
    preferredId?: string | null,
  ) {
    if (preferredId) {
      const account = await this.prisma.mainAccount.findFirst({
        where: { id: preferredId, status: 'active' },
        select: { id: true, code: true, name: true },
      });
      if (!account) {
        throw ApiException.validation('The selected payroll settlement account was not found or is inactive.');
      }
      return account;
    }
    if (!funding) {
      throw ApiException.invalidTransaction(
        'No payroll funding account is set, so there is no account to pay the salaries from.',
      );
    }
    return funding;
  }

  /**
   * Builds the accrual voucher: the salary expense is charged (split by
   * department where a department has its own expense account) and the net pay
   * is credited to each employee's own account, with the deductions held back
   * in the deductions payable account.
   */
  private async buildAccrualEntries(
    run: any,
    totals: { gross: number; deduction: number; net: number },
  ) {
    const salaryExpenseId = await this.defaultAccounts.resolveAccount('accounting.salary_expense_account');
    const salariesPayableId = await this.defaultAccounts.resolveAccount('accounting.salaries_payable_account');
    const deductionsPayableId = await this.defaultAccounts.resolveAccount('accounting.payroll_deductions_account');
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
      (s: number, item: any) => (item.employee.mainAccountId ? s : s + Number(item.netPay)),
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
    return entries;
  }

  /**
   * Builds the settlement voucher: the employee accounts credited at posting
   * are cleared, and the money leaves the account it was funded from.
   */
  private async buildSettlementEntries(run: any, netAmount: number, settlementAccountId: string) {
    const salariesPayableId = await this.defaultAccounts.resolveAccount('accounting.salaries_payable_account');
    if (!salariesPayableId) {
      throw ApiException.invalidTransaction(
        'Salaries Payable account is not configured. Set it in Chart of Accounts defaults before disbursing payroll.',
      );
    }
    const entries: { mainAccountId: string; debit?: number; credit?: number; narration?: string }[] = [];
    // Settle each employee's own bound account first; the rest clears the
    // global salaries payable account.
    const unlinkedNet = run.items.reduce(
      (s: number, item: any) => (item.employee.mainAccountId ? s : s + Number(item.netPay)),
      0,
    );
    if (unlinkedNet > 0) {
      entries.push({
        mainAccountId: salariesPayableId,
        debit: Math.round((unlinkedNet + Number.EPSILON) * 100) / 100,
        narration: 'Salaries settled',
      });
    }
    for (const item of run.items) {
      if (!item.employee.mainAccountId) continue;
      entries.push({
        mainAccountId: item.employee.mainAccountId,
        debit: Math.round((Number(item.netPay) + Number.EPSILON) * 100) / 100,
        narration: `Salary settled - ${item.employee.fullName}`,
      });
    }
    entries.push({
      mainAccountId: settlementAccountId,
      credit: round2(netAmount),
      narration: 'Payroll funding',
    });
    return entries;
  }

  /**
   * Books a run into the ledger inside a transaction the caller owns.
   *
   * `post` writes the accrual, `settle` writes the payment. Both run against
   * the caller's transaction, so a caller that wants "generate, post and pay"
   * gets one atomic operation rather than three steps that can half-fail.
   */
  private async bookRun(
    tx: any,
    run: any,
    actorId: string | undefined,
    opts: { post: boolean; settle: boolean; settlementAccountId?: string | null },
  ) {
    const totals = this.itemTotals(run.items);
    const data: Record<string, unknown> = {
      // Repair the header to match the items, so the stored totals can never
      // disagree with the voucher that was just booked.
      totalGross: totals.gross,
      totalDeduction: totals.deduction,
      totalNet: totals.net,
    };

    if (opts.post) {
      const entries = await this.buildAccrualEntries(run, totals);
      const number = await this.numbering.next('voucher_journal', 'JV', tx);
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: run.payDate,
          description: `Payroll for ${this.periodLabel(run.periodMonth, run.periodYear)}`,
          reference: run.number,
          entries,
          createdById: actorId,
        },
        number,
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);
      data.status = 'posted';
      data.voucherId = voucher.id;
      data.postedById = actorId ?? null;
      data.postedAt = new Date();
    }

    if (opts.settle) {
      const settlementAccountId = opts.settlementAccountId ?? run.fundingAccountId;
      if (!settlementAccountId) {
        throw ApiException.invalidTransaction(
          'No settlement account is set for this payroll, so there is nowhere to pay the salaries from.',
        );
      }
      const entries = await this.buildSettlementEntries(run, totals.net, settlementAccountId);
      const number = await this.numbering.next('voucher_journal', 'JV', tx);
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: new Date(),
          description: `Salary disbursement - ${this.periodLabel(run.periodMonth, run.periodYear)}`,
          reference: `${run.number}-DISB`,
          entries,
          createdById: actorId,
        },
        number,
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);
      data.paidAt = new Date();
      data.disbursementVoucherId = voucher.id;
      data.settlementAccountId = settlementAccountId;
    }

    return tx.payrollRun.update({
      where: { id: run.id },
      data,
      include: { items: { include: { employee: true } } },
    });
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

    const { lines } = await this.computeLines(employees, periodMonth, periodYear);

    const totalNet = round2(lines.reduce((sum, l) => sum + l.netPay, 0));
    const funding = await this.resolveFundingAccount(dto.fundingAccountId);
    if (!funding) {
      throw ApiException.invalidTransaction(
        'No payroll funding account is set. Choose one on the Generate Payroll form, or set "Payroll Funding Account" under Settings > Accounting.',
      );
    }
    await this.assertFundingBalance(funding, totalNet);

    const mode = dto.mode ?? 'draft';
    // When the run is also paid out, the money leaves the settlement account -
    // the funding account unless another one was named - so that account is
    // checked for the balance as well, before anything is written.
    let settlement: { id: string; code: string; name: string } | null = null;
    if (mode === 'post_and_pay') {
      settlement = await this.resolveSettlementAccount(funding, dto.settlementAccountId);
      await this.assertFundingBalance(settlement, totalNet);
    }

    const run = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next('payroll', 'PAY', tx, 4, { year: false });
      const created = await tx.payrollRun.create({
        data: {
          number,
          periodMonth,
          periodYear,
          payDate: dto.payDate ? new Date(dto.payDate) : new Date(),
          note: dto.note ?? null,
          fundingAccountId: funding.id,
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
      if (mode === 'draft') return saved!;

      // Generating, posting and paying happen in this one transaction: the
      // accrual, the payment out of the funding account and the run itself
      // either all land or none of them do. A run that is paid can never be
      // left sitting in the books as a posted-but-unpaid salary.
      return this.bookRun(tx, saved!, actorId, {
        post: true,
        settle: mode === 'post_and_pay',
        settlementAccountId: settlement?.id ?? null,
      });
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Payroll',
      entityId: run.id,
      message:
        mode === 'post_and_pay'
          ? `Payroll ${run.number} generated, posted and paid for ${this.periodLabel(periodMonth, periodYear)}`
          : mode === 'post'
            ? `Payroll ${run.number} generated and posted for ${this.periodLabel(periodMonth, periodYear)}`
            : `Payroll ${run.number} generated for ${this.periodLabel(periodMonth, periodYear)}`,
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
        include: {
          _count: { select: { items: true } },
          fundingAccount: { select: { id: true, code: true, name: true } },
        },
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
      fundingAccountId: r.fundingAccountId,
      fundingAccountName: r.fundingAccount ? `${r.fundingAccount.code} · ${r.fundingAccount.name}` : null,
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
        fundingAccount: { select: { id: true, code: true, name: true } },
        settlementAccount: { select: { id: true, code: true, name: true } },
        items: {
          include: { employee: { include: { department: true, designation: true } } },
          orderBy: { employee: { code: 'asc' } },
        },
      },
    });
    if (!item) throw ApiException.notFound('Payroll run');
    const [voucherNo, disbursementVoucherNo, fundingBalance] = await Promise.all([
      item.voucherId
        ? this.prisma.voucher.findUnique({ where: { id: item.voucherId }, select: { number: true } })
        : Promise.resolve(null),
      item.disbursementVoucherId
        ? this.prisma.voucher.findUnique({ where: { id: item.disbursementVoucherId }, select: { number: true } })
        : Promise.resolve(null),
      item.fundingAccountId
        ? this.accounting.accountBalance(item.fundingAccountId)
        : Promise.resolve(null),
    ]);
    return {
      ...item,
      periodLabel: this.periodLabel(item.periodMonth, item.periodYear),
      voucherNo: voucherNo?.number ?? null,
      disbursementVoucherNo: disbursementVoucherNo?.number ?? null,
      fundingBalance: fundingBalance === null ? null : round2(fundingBalance),
    };
  }

  /**
   * The accounts a payroll can be funded from, each with the balance it
   * currently holds.
   *
   * The Generate Payroll form shows these so the operator can see, before
   * choosing, whether the account they have in mind can actually cover the
   * run - and the balance is read from the ledger, not from a stored figure
   * that may be stale.
   */
  async fundingAccounts() {
    const accounts = await this.prisma.mainAccount.findMany({
      where: { status: 'active' },
      select: { id: true, code: true, name: true, accountType: true },
      orderBy: { code: 'asc' },
    });
    const balances = await this.accounting.accountBalances(accounts.map((a) => a.id));
    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      accountType: a.accountType,
      balance: round2(balances.get(a.id) ?? 0),
    }));
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

  /**
   * The configured EARNING components on a stored line, excluding the three
   * the gross is rebuilt from (basic, allowance and overtime).
   *
   * Rebuilding gross from those three alone used to drop every configured
   * earning - a transport allowance, a housing allowance - the moment somebody
   * edited an employee's overtime, quietly paying that employee less.
   */
  private earningComponentsAmount(item: any) {
    const breakdown = Array.isArray(item.componentBreakdown) ? item.componentBreakdown : [];
    return round2(
      breakdown
        .filter((b: any) => b.type === 'EARNING' && !['Basic', 'Allowance', 'Overtime'].includes(b.name))
        .reduce((sum: number, b: any) => sum + Number(b.amount ?? 0), 0),
    );
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
      const earningsTotal = this.earningComponentsAmount(item);
      const grossPay = Math.round((basic + allowance + overtimeAmount + earningsTotal + Number.EPSILON) * 100) / 100;
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

  /**
   * Recalculates a draft run from the live HR data.
   *
   * Attendance, the salary structure, the active salary components and the
   * loan installments are the source of truth: a run generated before a
   * correction to any of them would otherwise keep the old figures. Manual
   * adjustments on the draft are replaced by this - it is a recalculation,
   * not a merge - so the operator is told exactly what it does before calling
   * it.
   */
  async refresh(id: string, actorId?: string) {
    const run = await this.assertDraft(id);
    const employees = await this.prisma.employee.findMany({
      where: { status: 'active' },
      orderBy: { code: 'asc' },
    });
    if (employees.length === 0) {
      throw ApiException.invalidTransaction('No active employees to include in the payroll run');
    }

    const { lines } = await this.computeLines(employees, run.periodMonth, run.periodYear);
    const existingByEmployee = new Map(run.items.map((i) => [i.employeeId, i]));
    // The tax deduction is not derivable from attendance, it is the operator's
    // own figure, so a recalculation keeps it.
    const taxByEmployee = new Map(run.items.map((i) => [i.employeeId, Number(i.taxDeduction ?? 0)]));

    const refreshed = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const taxDeduction = taxByEmployee.get(line.employeeId) ?? 0;
        const totalDeduction = round2(line.absentDeduction + line.otherDeduction + taxDeduction);
        const netPay = round2(line.grossPay - totalDeduction);
        const data = {
          basic: line.basic,
          allowance: line.allowance,
          overtimeHours: line.overtimeHours,
          overtimeAmount: line.overtimeAmount,
          absentDays: line.absentDays,
          absentDeduction: line.absentDeduction,
          otherDeduction: line.otherDeduction,
          taxDeduction,
          grossPay: line.grossPay,
          totalDeduction,
          netPay,
          componentBreakdown: line.componentBreakdown.map((b) => ({
            name: b.name,
            type: b.type,
            amount: b.amount,
          })),
        };
        const existing = existingByEmployee.get(line.employeeId);
        if (existing) {
          await tx.payrollItem.update({ where: { id: existing.id }, data });
        } else {
          // Somebody joined after the run was generated; the run should cover
          // the roster as it stands now.
          await tx.payrollItem.create({ data: { ...data, employeeId: line.employeeId, payrollRunId: id } });
        }
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
      entityId: id, message: `Payroll ${run.number} recalculated from live attendance and salary data`,
    });
    return refreshed;
  }

  async post(id: string, actorId?: string) {
    const run = await this.findOne(id);
    if (run.status !== 'draft') {
      throw ApiException.invalidTransaction(`Only draft payroll runs can be posted (this one is ${run.status})`);
    }

    const totals = this.itemTotals(run.items);

    // Re-check against the funding account: its balance can move between
    // generation and posting, and posting is the point of no return.
    const funding = await this.resolveFundingAccount(run.fundingAccountId);
    if (!funding) {
      throw ApiException.invalidTransaction(
        'No payroll funding account is set. Choose one on the Generate Payroll form, or set "Payroll Funding Account" under Settings > Accounting.',
      );
    }
    await this.assertFundingBalance(funding, totals.net);

    const posted = await this.prisma.$transaction(async (tx) =>
      this.bookRun(tx, run, actorId, { post: true, settle: false }),
    );

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

    // The money leaves the account it was funded from. A bank account may be
    // named instead, which is the case where the salary is paid out of a
    // different account than the one the run was funded from.
    const funding = await this.resolveFundingAccount(run.fundingAccountId);
    let settlementId = dto.settlementAccountId ?? null;
    let settlementName = '';
    if (!settlementId && dto.bankAccountId) {
      const bank = await this.prisma.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
        include: { mainAccount: true },
      });
      if (!bank?.mainAccountId) {
        throw ApiException.invalidTransaction(
          'The selected bank account is not linked to a chart-of-accounts entry. Link one in Accounts > Banks first.',
        );
      }
      settlementId = bank.mainAccountId;
      settlementName = bank.name;
    }
    const settlement = await this.resolveSettlementAccount(funding, settlementId);
    settlementName = settlementName || `${settlement.code} · ${settlement.name}`;

    // The disbursement clears exactly what posting credited, so it uses the
    // same item-derived net rather than a possibly-drifted header total.
    const netAmount = this.itemTotals(run.items).net;
    await this.assertFundingBalance(settlement, netAmount);

    const paid = await this.prisma.$transaction(async (tx) =>
      this.bookRun(tx, run, actorId, { post: false, settle: true, settlementAccountId: settlement.id }),
    );

    this.audit.record({
      userId: actorId, action: 'POST', module: 'HR', entity: 'Payroll',
      entityId: id, message: `Payroll ${run.number} disbursed from ${settlementName} (voucher ${paid.disbursementVoucherId})`,
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
      // The disbursement is reversed first: the money has to come back into
      // the funding account before the accrual that created it is undone.
      if (run.disbursementVoucherId) {
        await this.accounting.cancelVoucher(tx, run.disbursementVoucherId, `Payroll cancelled: ${reason}`, actorId);
      }
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

  /**
   * Deletes a payroll run of any status. For a posted run the accounting
   * vouchers (payroll + disbursement if paid) are reversed first so the books
   * stay balanced; a cancelled run's vouchers are already reversed.
   */
  async remove(id: string, actorId?: string) {
    const run = await this.findOne(id);
    const wasPosted = run.status === 'posted';

    await this.prisma.$transaction(async (tx) => {
      if (wasPosted) {
        if (run.disbursementVoucherId) {
          await this.accounting.cancelVoucher(tx, run.disbursementVoucherId, `Payroll ${run.number} deleted`, actorId);
        }
        if (run.voucherId) {
          await this.accounting.cancelVoucher(tx, run.voucherId, `Payroll ${run.number} deleted`, actorId);
        }
      }
      await tx.payrollRun.delete({ where: { id } });
    });

    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Payroll',
      entityId: id,
      message: `Payroll ${run.number} deleted${wasPosted ? ' (accounting reversed)' : ''}`,
    });
    return { id, deleted: true };
  }
}