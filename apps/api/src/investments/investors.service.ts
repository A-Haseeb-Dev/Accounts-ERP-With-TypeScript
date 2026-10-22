import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { AccountingService } from '../common/services/accounting.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateInvestorDto, UpdateInvestorDto } from './dto/investments.dto';

/**
 * The people who place money with the business.
 *
 * Every investor may be bound to a ledger account of their own. The account
 * carries the capital that is owed to that investor, so "how much is still to
 * be returned to Mr. Khan" is an account balance rather than a sum that has to
 * be worked out from the investment rows every time.
 */
@Injectable()
export class InvestorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
  ) {}

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { cnic: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.investor.findMany({
        where,
        include: {
          mainAccount: { select: { id: true, code: true, name: true } },
          investments: { select: { id: true, number: true, principal: true, status: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.investor.count({ where }),
    ]);

    // The capital still owed is a real figure for the user, so it is worked
    // out here rather than making the UI add the rows up itself.
    const enriched = await Promise.all(
      items.map(async (investor) => {
        const active = investor.investments.filter(
          (i) => i.status === 'active' || i.status === 'planned',
        );
        const principal = active.reduce((s, i) => s + Number(i.principal), 0);
        const balance = investor.mainAccountId
          ? await this.accounting.accountBalance(investor.mainAccountId)
          : 0;
        return { ...investor, capitalOutstanding: round2(principal), accountBalance: round2(balance) };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const investor = await this.prisma.investor.findUnique({
      where: { id },
      include: {
        mainAccount: true,
        investments: {
          include: { installments: true },
          orderBy: { startDate: 'desc' },
        },
      },
    });
    if (!investor) throw ApiException.notFound('Investor');

    const accountBalance = investor.mainAccountId
      ? await this.accounting.accountBalance(investor.mainAccountId)
      : 0;
    const principalOutstanding = investor.investments
      .filter((i) => i.status === 'active' || i.status === 'planned')
      .reduce((s, i) => s + Number(i.principal), 0);
    const returnsPaid = investor.investments
      .flatMap((i) => i.installments)
      .filter((inst) => inst.status === 'paid' && inst.kind === 'RETURN')
      .reduce((s, inst) => s + Number(inst.amount), 0);

    return {
      ...investor,
      accountBalance: round2(accountBalance),
      principalOutstanding: round2(principalOutstanding),
      returnsPaid: round2(returnsPaid),
    };
  }

  /**
   * A statement for one investor: every rupee in, every return paid out and
   * every principal returned, with the capital still owed running alongside.
   * The same data drives the on-screen view and its print/PDF output.
   */
  async statement(id: string, query: { from?: string; to?: string }) {
    const investor = await this.prisma.investor.findUnique({
      where: { id },
      include: {
        mainAccount: { select: { id: true, code: true, name: true } },
        investments: {
          include: { installments: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!investor) throw ApiException.notFound('Investor');

    type Event = {
      date: Date;
      type: 'CAPITAL_IN' | 'RETURN' | 'PRINCIPAL';
      reference: string;
      description: string;
      amount: number;
    };
    const events: Event[] = [];

    for (const inv of investor.investments) {
      if (inv.receivedAt) {
        events.push({
          date: new Date(inv.receivedAt),
          type: 'CAPITAL_IN',
          reference: inv.number,
          description: 'Capital received',
          amount: Number(inv.principal),
        });
      }
      for (const inst of inv.installments) {
        if (inst.status !== 'paid' || !inst.paidAt) continue;
        events.push({
          date: new Date(inst.paidAt),
          type: inst.kind === 'PRINCIPAL' ? 'PRINCIPAL' : 'RETURN',
          reference: inv.number,
          description:
            inst.kind === 'PRINCIPAL'
              ? 'Principal returned'
              : `Monthly return${inst.note ? ` - ${inst.note}` : ''}`,
          amount: Number(inst.amount),
        });
      }
    }
    events.sort((a, b) => +a.date - +b.date);

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    let openingCapital = 0;
    for (const e of events) {
      if (from && e.date < from) openingCapital += capitalDelta(e.type, e.amount);
    }

    let running = round2(openingCapital);
    const rows: {
      date: string;
      type: string;
      reference: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    for (const e of events) {
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      running = round2(running + capitalDelta(e.type, e.amount));
      rows.push({
        date: e.date.toISOString().slice(0, 10),
        type: e.type,
        reference: e.reference,
        description: e.description,
        debit: e.type === 'CAPITAL_IN' ? 0 : e.amount,
        credit: e.type === 'CAPITAL_IN' ? e.amount : 0,
        balance: running,
      });
    }

    const allInstallments = investor.investments.flatMap((i) => i.installments);
    const capitalReceived = investor.investments
      .filter((i) => i.receivedAt)
      .reduce((s, i) => s + Number(i.principal), 0);
    const returnsPaid = allInstallments
      .filter((i) => i.status === 'paid' && i.kind === 'RETURN')
      .reduce((s, i) => s + Number(i.amount), 0);
    const principalReturned = allInstallments
      .filter((i) => i.status === 'paid' && i.kind === 'PRINCIPAL')
      .reduce((s, i) => s + Number(i.amount), 0);
    const pendingReturns = allInstallments.filter(
      (i) => i.status === 'pending' && i.kind === 'RETURN',
    );
    const nextDue = pendingReturns.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];

    return {
      investor: {
        id: investor.id,
        code: investor.code,
        name: investor.name,
        phone: investor.phone,
        email: investor.email,
        cnic: investor.cnic,
        address: investor.address,
        status: investor.status,
        mainAccount: investor.mainAccount,
      },
      from: query.from ?? null,
      to: query.to ?? null,
      openingCapital: round2(openingCapital),
      closingCapital: round2(running),
      totalCapitalReceived: round2(capitalReceived),
      totalReturnsPaid: round2(returnsPaid),
      totalPrincipalReturned: round2(principalReturned),
      capitalOutstanding: round2(capitalReceived - principalReturned),
      activeInvestments: investor.investments.filter((i) => i.status === 'active').length,
      closedInvestments: investor.investments.filter((i) => i.status === 'closed').length,
      nextDueDate: nextDue?.dueDate ?? null,
      investments: investor.investments.map((i) => {
        const paidReturns = i.installments
          .filter((x) => x.status === 'paid' && x.kind === 'RETURN')
          .reduce((s, x) => s + Number(x.amount), 0);
        const paidPrincipal = i.installments
          .filter((x) => x.status === 'paid' && x.kind === 'PRINCIPAL')
          .reduce((s, x) => s + Number(x.amount), 0);
        return {
          id: i.id,
          number: i.number,
          principal: Number(i.principal),
          status: i.status,
          startDate: i.startDate,
          receivedAt: i.receivedAt,
          closedAt: i.closedAt,
          returnsPaid: round2(paidReturns),
          principalReturned: round2(paidPrincipal),
          principalOutstanding: round2(Number(i.principal) - paidPrincipal),
        };
      }),
      rows,
    };
  }

  async create(dto: CreateInvestorDto, actorId?: string) {
    const code = (dto.code ?? '').trim() || (await this.nextInvestorCode());
    const existing = await this.prisma.investor.findFirst({ where: { code } });
    if (existing) throw ApiException.duplicateCode('Investor code');

    let mainAccountId = dto.mainAccountId ?? null;
    if (mainAccountId) {
      const account = await this.prisma.mainAccount.findUnique({ where: { id: mainAccountId } });
      if (!account) throw ApiException.notFound('Main account');
    } else {
      // The investor gets an account of their own so the capital owed to them
      // is a real balance in the ledger.
      mainAccountId = await this.createInvestorAccount(dto.name, code);
    }

    const investor = await this.prisma.investor.create({
      data: {
        code,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        cnic: dto.cnic ?? null,
        address: dto.address ?? null,
        mainAccountId,
        openingBalance: dto.openingBalance ?? 0,
        note: dto.note ?? null,
        status: 'active',
      },
      include: { mainAccount: true },
    });

    if (Number(dto.openingBalance ?? 0) > 0 && mainAccountId) {
      await this.prisma.mainAccount.update({
        where: { id: mainAccountId },
        data: {
          openingBalance: dto.openingBalance,
          openingBalanceType: 'CR',
        },
      });
      await this.accounting.syncOpeningVoucher(mainAccountId, actorId);
    }

    this.audit.record({
      userId: actorId,
      action: 'CREATE',
      module: 'INVESTMENTS',
      entity: 'Investor',
      entityId: investor.id,
      message: `Investor ${investor.name} (${investor.code}) added`,
    });
    return investor;
  }

  async update(id: string, dto: UpdateInvestorDto, actorId?: string) {
    const investor = await this.prisma.investor.findUnique({ where: { id } });
    if (!investor) throw ApiException.notFound('Investor');

    if (dto.mainAccountId && dto.mainAccountId !== investor.mainAccountId) {
      const account = await this.prisma.mainAccount.findUnique({ where: { id: dto.mainAccountId } });
      if (!account) throw ApiException.notFound('Main account');
    }

    const updated = await this.prisma.investor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.cnic !== undefined ? { cnic: dto.cnic } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.mainAccountId !== undefined ? { mainAccountId: dto.mainAccountId } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
      include: { mainAccount: true, investments: true },
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'INVESTMENTS',
      entity: 'Investor',
      entityId: id,
      message: `Investor ${updated.name} updated`,
    });
    return updated;
  }

  /**
   * Removes an investor. An investor with investments on record is never
   * deleted - that would take the history of the money away with them.
   */
  async remove(id: string, actorId?: string) {
    const investor = await this.prisma.investor.findUnique({
      where: { id },
      include: { investments: { select: { id: true, number: true } } },
    });
    if (!investor) throw ApiException.notFound('Investor');
    if (investor.investments.length > 0) {
      throw ApiException.deleteBlocked('Investor', [
        `${investor.investments.length} investment(s)`,
      ]);
    }

    // The account this module opened for the investor goes with them, but
    // only when it is the one that was opened here (its code carries the
    // investor's own code) and nothing has been booked on it. An account the
    // user picked from the chart of accounts is left alone.
    const account = investor.mainAccountId
      ? await this.prisma.mainAccount.findUnique({
          where: { id: investor.mainAccountId },
          select: { id: true, code: true },
        })
      : null;
    const isOpenedHere = account?.code === this.investorAccountCode(investor.code);
    const hasEntries = account
      ? await this.prisma.voucherEntry.count({ where: { mainAccountId: account.id } })
      : 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.investor.delete({ where: { id } });
      if (isOpenedHere && account && hasEntries === 0) {
        try {
          await tx.mainAccount.delete({ where: { id: account.id } });
        } catch {
          // The account is still referenced by something else, so it stays.
        }
      }
    });

    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'INVESTMENTS',
      entity: 'Investor',
      entityId: id,
      message: `Investor ${investor.name} (${investor.code}) deleted`,
    });
    return { id, deleted: true };
  }

  /** The code of the account this module opens for an investor. */
  private investorAccountCode(investorCode: string): string {
    return `INV-${investorCode}`.slice(0, 30);
  }

  /** The next investor code, e.g. `INV-0007`. */
  private async nextInvestorCode(): Promise<string> {
    const seq = await this.numbering.nextSequence('investor');
    return `INV-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Opens a liability account that carries one investor's capital.
   */
  private async createInvestorAccount(name: string, code: string): Promise<string | null> {
    const accountCode = this.investorAccountCode(code);
    const existing = await this.prisma.mainAccount.findFirst({
      where: { code: accountCode },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const account = await this.prisma.mainAccount.create({
        data: {
          code: accountCode,
          name: `Investment - ${name}`,
          accountType: 'LIABILITY',
          description: `Capital owed to ${name}`,
          openingBalance: 0,
          openingBalanceType: 'CR',
        },
        select: { id: true },
      });
      return account.id;
    } catch {
      // The account could not be opened (a code clash, for example). The
      // investment still works - it falls back to the configured capital
      // account - so this is not worth failing the whole save over.
      return null;
    }
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** How an event moves the capital still owed to the investor. */
function capitalDelta(type: 'CAPITAL_IN' | 'RETURN' | 'PRINCIPAL', amount: number): number {
  if (type === 'CAPITAL_IN') return amount;
  if (type === 'PRINCIPAL') return -amount;
  return 0;
}
