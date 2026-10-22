import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { dateRange } from '../common/utils/date-filter';
import {
  CloseInvestmentDto,
  CreateInvestmentDto,
  PayInstallmentDto,
  ReceiveInvestmentDto,
  UpdateInvestmentDto,
} from './dto/investments.dto';

/**
 * Money placed with the business by an investor.
 *
 * The life of an investment is: the principal comes in, a monthly return goes
 * out, and the principal comes back at maturity. Each of those three steps is
 * a balanced voucher:
 *
 *   receive  - Dr funding account (cash in), Cr capital account (money owed)
 *   return   - Dr investment return expense, Cr funding account (cash out)
 *   maturity - Dr capital account, Cr funding account (the money goes back)
 *
 * The capital account is the investor's own account where there is one, so the
 * amount owed to that investor is a real account balance rather than a figure
 * that has to be summed from the investment rows.
 */
@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  previewNumber() {
    return this.numbering.preview('investment', 'INV', 4, { year: false });
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    investorId?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, investorId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { investor: { name: { contains: search, mode: 'insensitive' } } },
        { investor: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (investorId) where.investorId = investorId;
    if (from || to) where.startDate = dateRange(from, to);

    const [items, total] = await Promise.all([
      this.prisma.investment.findMany({
        where,
        include: {
          investor: { select: { id: true, code: true, name: true, mainAccountId: true } },
          installments: { orderBy: { sequence: 'asc' } },
          fundingAccount: { select: { id: true, code: true, name: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.investment.count({ where }),
    ]);

    return {
      items: items.map((i) => this.withTotals(i)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: {
        investor: { include: { mainAccount: true } },
        installments: { orderBy: { sequence: 'asc' } },
        fundingAccount: true,
        capitalAccount: true,
        returnExpenseAccount: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!investment) throw ApiException.notFound('Investment');
    return this.withTotals(investment);
  }

  /**
   * Records a new investment. The money has not been received yet, so this
   * only writes the arrangement and its schedule of payouts.
   */
  async create(dto: CreateInvestmentDto, actorId?: string) {
    const investor = await this.prisma.investor.findUnique({ where: { id: dto.investorId } });
    if (!investor) throw ApiException.notFound('Investor');
    if (investor.status !== 'active') {
      throw ApiException.invalidTransaction('This investor is not active');
    }

    const principal = round2(dto.principal);
    if (principal <= 0) {
      throw ApiException.validation('Principal must be greater than zero');
    }
    const returnType = dto.returnType ?? 'FIXED';
    const termMonths = dto.termMonths ?? 6;
    const monthlyReturn = round2(dto.monthlyReturn ?? 0);
    if (returnType === 'FIXED' && monthlyReturn <= 0) {
      throw ApiException.validation('A fixed monthly return must be greater than zero');
    }
    if (returnType === 'PROFIT_SHARE' && (dto.profitSharePercent ?? 0) <= 0) {
      throw ApiException.validation('A profit share investment must have a profit share percentage');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    await this.fiscal.assertOpen(startDate, 'Cannot create an investment');

    if (dto.fundingAccountId) await this.assertMainAccount(dto.fundingAccountId, 'Funding account');
    if (dto.capitalAccountId) await this.assertMainAccount(dto.capitalAccountId, 'Capital account');
    if (dto.returnExpenseAccountId) {
      await this.assertMainAccount(dto.returnExpenseAccountId, 'Return expense account');
    }

    const schedule = this.buildSchedule({
      principal,
      termMonths,
      monthlyReturn,
      returnType,
      startDate,
    });

    const number = await this.numbering.next('investment', 'INV', undefined, 4, { year: false });
    const investment = await this.prisma.investment.create({
      data: {
        number,
        investorId: dto.investorId,
        principal,
        startDate,
        termMonths,
        returnType,
        monthlyReturn,
        profitSharePercent: dto.profitSharePercent ?? 0,
        totalReturn: returnType === 'FIXED' ? round2(monthlyReturn * termMonths) : 0,
        status: 'planned',
        fundingAccountId: dto.fundingAccountId ?? null,
        capitalAccountId: dto.capitalAccountId ?? null,
        returnExpenseAccountId: dto.returnExpenseAccountId ?? null,
        note: dto.note ?? null,
        createdById: actorId ?? null,
        installments: { create: schedule },
      },
      include: { investor: true, installments: true },
    });

    this.audit.record({
      userId: actorId,
      action: 'CREATE',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: investment.id,
      message: `Investment ${investment.number} created for ${investor.name} (principal ${principal})`,
    });
    return this.withTotals(investment);
  }

  async update(id: string, dto: UpdateInvestmentDto, actorId?: string) {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: { installments: true },
    });
    if (!investment) throw ApiException.notFound('Investment');
    if (investment.status === 'closed' || investment.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `A ${investment.status} investment cannot be edited`,
      );
    }
    if (investment.installments.some((i) => i.status === 'paid')) {
      throw ApiException.invalidTransaction(
        'This investment already has a payout against it and can no longer be edited',
      );
    }

    if (dto.fundingAccountId) await this.assertMainAccount(dto.fundingAccountId, 'Funding account');
    if (dto.capitalAccountId) await this.assertMainAccount(dto.capitalAccountId, 'Capital account');
    if (dto.returnExpenseAccountId) {
      await this.assertMainAccount(dto.returnExpenseAccountId, 'Return expense account');
    }

    const principal = dto.principal !== undefined ? round2(dto.principal) : Number(investment.principal);
    const termMonths = dto.termMonths ?? investment.termMonths;
    const returnType = dto.returnType ?? investment.returnType;
    const monthlyReturn =
      dto.monthlyReturn !== undefined ? round2(dto.monthlyReturn) : Number(investment.monthlyReturn);

    const updated = await this.prisma.runInTransaction(async (tx) => {
      await tx.investmentInstallment.deleteMany({ where: { investmentId: id } });
      const schedule = this.buildSchedule({
        principal,
        termMonths,
        monthlyReturn,
        returnType,
        startDate: investment.startDate,
      });
      await tx.investmentInstallment.createMany({
        data: schedule.map((s) => ({ ...s, investmentId: id })),
      });
      return tx.investment.update({
        where: { id },
        data: {
          principal,
          termMonths,
          returnType,
          monthlyReturn,
          ...(dto.profitSharePercent !== undefined
            ? { profitSharePercent: dto.profitSharePercent }
            : {}),
          totalReturn: returnType === 'FIXED' ? round2(monthlyReturn * termMonths) : 0,
          ...(dto.fundingAccountId !== undefined ? { fundingAccountId: dto.fundingAccountId } : {}),
          ...(dto.capitalAccountId !== undefined ? { capitalAccountId: dto.capitalAccountId } : {}),
          ...(dto.returnExpenseAccountId !== undefined
            ? { returnExpenseAccountId: dto.returnExpenseAccountId }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
        },
        include: { investor: true, installments: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: id,
      message: `Investment ${investment.number} updated`,
    });
    return this.withTotals(updated);
  }

  /**
   * Records the money coming in: the funding account is debited and the
   * capital account credited, so the business holds the cash and owes the
   * investor the same amount.
   */
  async receive(id: string, dto: ReceiveInvestmentDto, actorId?: string) {
    const investment = await this.findOne(id);
    if (investment.receivedAt) {
      throw ApiException.invalidTransaction('The money for this investment has already been received');
    }
    if (investment.status === 'cancelled' || investment.status === 'closed') {
      throw ApiException.invalidTransaction(`A ${investment.status} investment cannot receive money`);
    }

    const receivedDate = dto.receivedDate ? new Date(dto.receivedDate) : new Date();
    await this.fiscal.assertOpen(receivedDate, 'Cannot receive money against an investment');

    const principal = round2(Number(investment.principal));
    const funding = await this.resolveFundingAccount(investment, dto.fundingAccountId);
    const capital = await this.resolveCapitalAccount(investment);

    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: receivedDate,
          description: `Investment ${investment.number} - ${investment.investor.name}`,
          reference: investment.number,
          entries: [
            {
              mainAccountId: funding.id,
              debit: principal,
              narration: `Investment received - ${investment.investor.name}`,
            },
            {
              mainAccountId: capital.id,
              credit: principal,
              narration: `Investment capital - ${investment.investor.name}`,
            },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_journal', 'JV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      return tx.investment.update({
        where: { id },
        data: {
          status: 'active',
          receivedAt: receivedDate,
          receivedVoucherId: voucher.id,
          fundingAccountId: funding.id,
          capitalAccountId: capital.id,
        },
        include: { investor: true, installments: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'RECEIVE',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: id,
      message: `Investment ${investment.number} received ${principal} from ${investment.investor.name}`,
    });
    return this.withTotals(result);
  }

  /**
   * Pays one installment - a monthly return or the principal coming back.
   */
  async payInstallment(
    investmentId: string,
    installmentId: string,
    dto: PayInstallmentDto,
    actorId?: string,
  ) {
    const investment = await this.findOne(investmentId);
    if (!investment.receivedAt) {
      throw ApiException.invalidTransaction(
        'The money for this investment has not been received yet',
      );
    }
    if (investment.status === 'closed' || investment.status === 'cancelled') {
      throw ApiException.invalidTransaction(`A ${investment.status} investment cannot be paid out`);
    }
    const installment = investment.installments.find((i: any) => i.id === installmentId);
    if (!installment) throw ApiException.notFound('Installment');
    if (installment.status === 'paid') {
      throw ApiException.invalidTransaction('This installment has already been paid');
    }

    const amount = round2(dto.amount ?? Number(installment.amount));
    if (amount <= 0) {
      throw ApiException.validation(
        'Enter the amount to pay - a profit-share return is only known at payout time',
      );
    }

    const paidDate = dto.paidDate ? new Date(dto.paidDate) : new Date();
    await this.fiscal.assertOpen(paidDate, 'Cannot pay an installment');

    const funding = await this.resolveFundingAccount(investment, dto.fundingAccountId);
    await this.assertBalance(funding, amount);

    const isPrincipal = installment.kind === 'PRINCIPAL';
    // A return is an expense of the business; the principal going back is the
    // capital account being relieved.
    const debitAccount = isPrincipal
      ? await this.resolveCapitalAccount(investment)
      : await this.resolveReturnExpenseAccount(investment);
    const narration = isPrincipal
      ? `Principal returned - ${investment.investor.name}`
      : `Investment return - ${investment.investor.name}`;

    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: paidDate,
          description: isPrincipal
            ? `Investment ${investment.number} - principal returned to ${investment.investor.name}`
            : `Investment ${investment.number} - return paid to ${investment.investor.name}`,
          reference: investment.number,
          entries: [
            { mainAccountId: debitAccount.id, debit: amount, narration },
            { mainAccountId: funding.id, credit: amount, narration },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_journal', 'JV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      await tx.investmentInstallment.update({
        where: { id: installmentId },
        data: {
          amount,
          status: 'paid',
          paidAt: paidDate,
          paidVoucherId: voucher.id,
          note: dto.note ?? installment.note ?? null,
        },
      });

      return tx.investment.findUnique({
        where: { id: investmentId },
        include: { investor: true, installments: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'PAY',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: investmentId,
      message: `Investment ${investment.number} - ${installment.kind.toLowerCase()} of ${amount} paid to ${investment.investor.name}`,
    });
    return this.withTotals(result);
  }

  /**
   * Marks an installment as skipped - the month had no payout, and saying so
   * keeps the schedule honest instead of leaving it pending forever.
   */
  async skipInstallment(
    investmentId: string,
    installmentId: string,
    dto: { note?: string },
    actorId?: string,
  ) {
    const investment = await this.findOne(investmentId);
    const installment = investment.installments.find((i: any) => i.id === installmentId);
    if (!installment) throw ApiException.notFound('Installment');
    if (installment.status === 'paid') {
      throw ApiException.invalidTransaction('A paid installment cannot be skipped');
    }
    const updated = await this.prisma.investmentInstallment.update({
      where: { id: installmentId },
      data: { status: 'skipped', note: dto.note ?? installment.note ?? null },
    });
    this.audit.record({
      userId: actorId,
      action: 'SKIP',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: investmentId,
      message: `Investment ${investment.number} - installment ${installment.sequence} skipped`,
    });
    return updated;
  }

  /**
   * Closes an investment: the principal goes back to the investor and the
   * arrangement ends.
   */
  async close(id: string, dto: CloseInvestmentDto, actorId?: string) {
    const investment = await this.findOne(id);
    if (investment.status === 'closed') return investment;
    if (investment.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled investment cannot be closed');
    }
    if (!investment.receivedAt) {
      throw ApiException.invalidTransaction(
        'This investment has not received any money yet, so there is nothing to return',
      );
    }
    // Only what is still owed goes back. A principal installment that was
    // already paid must not be returned a second time.
    const principalOutstanding = round2(Number(investment.principalOutstanding ?? investment.principal));
    if (principalOutstanding <= 0) {
      throw ApiException.invalidTransaction('The principal has already been returned');
    }

    const closedDate = dto.closedDate ? new Date(dto.closedDate) : new Date();
    await this.fiscal.assertOpen(closedDate, 'Cannot close an investment');

    const funding = await this.resolveFundingAccount(investment, dto.fundingAccountId);
    await this.assertBalance(funding, principalOutstanding);
    const capital = await this.resolveCapitalAccount(investment);

    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: closedDate,
          description: `Investment ${investment.number} closed - principal returned to ${investment.investor.name}`,
          reference: investment.number,
          entries: [
            {
              mainAccountId: capital.id,
              debit: principalOutstanding,
              narration: `Principal returned - ${investment.investor.name}`,
            },
            {
              mainAccountId: funding.id,
              credit: principalOutstanding,
              narration: `Principal returned - ${investment.investor.name}`,
            },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_journal', 'JV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      // The principal installment is settled by the closing voucher.
      await tx.investmentInstallment.updateMany({
        where: { investmentId: id, kind: 'PRINCIPAL', status: { not: 'paid' } },
        data: {
          amount: principalOutstanding,
          status: 'paid',
          paidAt: closedDate,
          paidVoucherId: voucher.id,
        },
      });
      // Returns that never came due are struck off with the investment.
      await tx.investmentInstallment.updateMany({
        where: { investmentId: id, status: 'pending' },
        data: { status: 'skipped', note: 'Investment closed' },
      });

      return tx.investment.update({
        where: { id },
        data: {
          status: 'closed',
          closedAt: closedDate,
          closedVoucherId: voucher.id,
          note: dto.note ?? investment.note ?? null,
        },
        include: { investor: true, installments: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'CLOSE',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: id,
      message: `Investment ${investment.number} closed - ${principalOutstanding} returned to ${investment.investor.name}`,
    });
    return this.withTotals(result);
  }

  /**
   * Cancels an investment. One that has already received money is closed
   * instead, because the money has to go back through the ledger.
   */
  async cancel(id: string, reason: string, actorId?: string) {
    const investment = await this.findOne(id);
    if (investment.status === 'cancelled') return investment;
    if (investment.receivedAt) {
      throw ApiException.invalidTransaction(
        'This investment has already received money. Close it instead so the money is returned through the ledger.',
      );
    }
    const cancelled = await this.prisma.investment.update({
      where: { id },
      data: { status: 'cancelled', note: reason ?? investment.note ?? null },
    });
    this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: id,
      message: `Investment ${investment.number} cancelled`,
      metadata: { reason },
    });
    return cancelled;
  }

  /**
   * Deletes an investment that never touched the ledger.
   */
  async remove(id: string, actorId?: string) {
    const investment = await this.findOne(id);
    if (investment.receivedAt || investment.installments.some((i: any) => i.status === 'paid')) {
      throw ApiException.deleteBlocked('Investment', ['money has been received or paid out']);
    }
    await this.prisma.investment.delete({ where: { id } });
    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'INVESTMENTS',
      entity: 'Investment',
      entityId: id,
      message: `Investment ${investment.number} deleted`,
    });
    return { id, deleted: true };
  }

  /**
   * The schedule of payouts for an investment: one row a month for the
   * returns, and a final row for the principal coming back.
   */
  private buildSchedule(input: {
    principal: number;
    termMonths: number;
    monthlyReturn: number;
    returnType: string;
    startDate: Date;
  }) {
    const rows: {
      sequence: number;
      kind: string;
      dueDate: Date;
      amount: number;
    }[] = [];
    for (let month = 1; month <= input.termMonths; month++) {
      rows.push({
        sequence: month,
        kind: 'RETURN',
        dueDate: addMonths(input.startDate, month),
        // A profit share is only known when the profit is, so the row waits
        // for the amount to be entered at payout time.
        amount: input.returnType === 'FIXED' ? input.monthlyReturn : 0,
      });
    }
    rows.push({
      sequence: input.termMonths + 1,
      kind: 'PRINCIPAL',
      dueDate: addMonths(input.startDate, input.termMonths),
      amount: input.principal,
    });
    return rows;
  }

  private async assertMainAccount(id: string, label: string) {
    const account = await this.prisma.mainAccount.findUnique({ where: { id } });
    if (!account) throw ApiException.notFound(label);
    if (account.status !== 'active') {
      throw ApiException.invalidTransaction(`${label} "${account.name}" is not active`);
    }
    return account;
  }

  /** The cash/bank account the money moves through. */
  private async resolveFundingAccount(
    investment: any,
    preferredId?: string,
  ): Promise<{ id: string; code: string; name: string }> {
    const id = preferredId ?? investment.fundingAccountId;
    if (!id) {
      throw ApiException.invalidTransaction(
        'No funding account is set on this investment. Choose the cash or bank account the money moves through.',
      );
    }
    const account = await this.assertMainAccount(id, 'Funding account');
    return { id: account.id, code: account.code, name: account.name };
  }

  /**
   * The account the principal is credited to: the investment's own account if
   * it has one, otherwise the investor's account, otherwise the account
   * configured in Settings.
   */
  private async resolveCapitalAccount(
    investment: any,
  ): Promise<{ id: string; code: string; name: string }> {
    const preferred =
      investment.capitalAccountId ?? investment.investor?.mainAccountId ?? null;
    if (preferred) {
      const account = await this.assertMainAccount(preferred, 'Capital account');
      return { id: account.id, code: account.code, name: account.name };
    }
    const configured = await this.defaultAccounts.resolveAccount(
      'accounting.investment_capital_account',
    );
    if (!configured) {
      throw ApiException.invalidTransaction(
        'No capital account is set for this investment. Give the investor their own ledger account, or set "Investment Capital Account" under Settings > Accounting.',
      );
    }
    const account = await this.assertMainAccount(configured, 'Capital account');
    return { id: account.id, code: account.code, name: account.name };
  }

  /** The expense the monthly returns are charged to. */
  private async resolveReturnExpenseAccount(
    investment: any,
  ): Promise<{ id: string; code: string; name: string }> {
    const id =
      investment.returnExpenseAccountId ??
      (await this.defaultAccounts.resolveAccount('accounting.investment_return_expense_account'));
    if (!id) {
      throw ApiException.invalidTransaction(
        'No account is set for the investment return expense. Set "Investment Return Expense Account" under Settings > Accounting.',
      );
    }
    const account = await this.assertMainAccount(id, 'Return expense account');
    return { id: account.id, code: account.code, name: account.name };
  }

  /** Makes sure the account the money leaves has enough in it. */
  private async assertBalance(account: { id: string; code: string; name: string }, amount: number) {
    const balance = round2(await this.accounting.accountBalance(account.id));
    if (amount > balance) {
      throw ApiException.invalidTransaction(
        `Not enough balance in "${account.name} (${account.code})". ` +
          `Available ${balance.toFixed(2)}, required ${amount.toFixed(2)}.`,
      );
    }
  }

  /** Adds the paid / pending / outstanding figures to an investment. */
  private withTotals(investment: any) {
    const installments = investment.installments ?? [];
    const returnsPaid = installments
      .filter((i: any) => i.kind === 'RETURN' && i.status === 'paid')
      .reduce((s: number, i: any) => s + Number(i.amount), 0);
    const principalPaid = installments
      .filter((i: any) => i.kind === 'PRINCIPAL' && i.status === 'paid')
      .reduce((s: number, i: any) => s + Number(i.amount), 0);
    const pending = installments.filter(
      (i: any) => i.status === 'pending' && i.kind === 'RETURN',
    );
    return {
      ...investment,
      returnsPaid: round2(returnsPaid),
      principalPaid: round2(principalPaid),
      principalOutstanding: round2(Number(investment.principal) - principalPaid),
      nextDueDate: pending.length
        ? pending.sort((a: any, b: any) => +new Date(a.dueDate) - +new Date(b.dueDate))[0].dueDate
        : null,
    };
  }
}

/** Adds whole months to a date, keeping the day of the month. */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
