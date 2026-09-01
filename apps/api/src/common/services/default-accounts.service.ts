import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const HEAD_ACCOUNTS = [
  { code: '01', name: 'Assets', type: 'ASSET' },
  { code: '02', name: 'Liabilities', type: 'LIABILITY' },
  { code: '03', name: 'Equity', type: 'EQUITY' },
  { code: '04', name: 'Revenue', type: 'REVENUE' },
  { code: '05', name: 'Expenses', type: 'EXPENSE' },
];

const SUB_HEADS = [
  { code: '01', name: 'Current Assets', headCode: '01' },
  { code: '02', name: 'Fixed Assets', headCode: '01' },
  { code: '01', name: 'Current Liabilities', headCode: '02' },
  { code: '02', name: 'Long Term Liabilities', headCode: '02' },
  { code: '01', name: 'Capital', headCode: '03' },
  { code: '01', name: 'Direct Revenue', headCode: '04' },
  { code: '01', name: 'Operating Expenses', headCode: '05' },
  { code: '02', name: 'Cost of Sales', headCode: '05' },
];

/**
 * Standard default accounts used by the transaction engine. Their IDs are
 * recorded in system settings so integrators (sales/purchases) can resolve
 * them, and administrators can point them to different accounts later.
 */
const MAIN_ACCOUNTS: { code: string; name: string; subHead: string; type: string; settingKey?: string }[] = [
  { code: '01-01', name: 'Cash Account', subHead: 'Current Assets', type: 'ASSET', settingKey: 'accounting.cash_account' },
  { code: '01-02', name: 'Bank Account', subHead: 'Current Assets', type: 'ASSET' },
  { code: '01-03', name: 'Accounts Receivable', subHead: 'Current Assets', type: 'ASSET', settingKey: 'accounting.receivable_account' },
  { code: '01-04', name: 'Inventory', subHead: 'Current Assets', type: 'ASSET', settingKey: 'accounting.inventory_account' },
  { code: '02-01', name: 'Accounts Payable', subHead: 'Current Liabilities', type: 'LIABILITY', settingKey: 'accounting.payable_account' },
  { code: '02-02', name: 'Sales Tax Payable', subHead: 'Current Liabilities', type: 'LIABILITY', settingKey: 'accounting.tax_account' },
  { code: '03-01', name: 'Opening Equity', subHead: 'Capital', type: 'EQUITY' },
  { code: '03-02', name: 'Owner Capital', subHead: 'Capital', type: 'EQUITY' },
  { code: '04-01', name: 'Sales Revenue', subHead: 'Direct Revenue', type: 'REVENUE', settingKey: 'accounting.revenue_account' },
  { code: '04-02', name: 'Sales Returns', subHead: 'Direct Revenue', type: 'REVENUE', settingKey: 'accounting.sales_return_account' },
  { code: '05-01', name: 'Purchases', subHead: 'Cost of Sales', type: 'EXPENSE' },
  { code: '05-02', name: 'Purchase Returns', subHead: 'Cost of Sales', type: 'EXPENSE', settingKey: 'accounting.purchase_return_account' },
];

@Injectable()
export class DefaultAccountsService implements OnModuleInit {
  private readonly logger = new Logger(DefaultAccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.SKIP_ACCOUNT_BOOTSTRAP === 'true') return;
    await this.ensureDefaultAccounts().catch((err) =>
      this.logger.error(`Default accounts bootstrap failed: ${(err as Error).message}`),
    );
  }

  private async ensureDefaultAccounts() {
    for (const head of HEAD_ACCOUNTS) {
      await this.prisma.headAccount.upsert({
        where: { code: head.code },
        create: { code: head.code, name: head.name, status: 'active' },
        update: { name: head.name },
      });
    }

    for (const sub of SUB_HEADS) {
      const head = await this.prisma.headAccount.findUnique({ where: { code: sub.headCode } });
      if (!head) continue;
      const existing = await this.prisma.subHead.findFirst({
        where: { code: sub.code, headAccountId: head.id },
      });
      if (!existing) {
        await this.prisma.subHead.create({
          data: { code: sub.code, name: sub.name, headAccountId: head.id, status: 'active' },
        });
      }
    }

    for (const acc of MAIN_ACCOUNTS) {
      const existing = await this.prisma.mainAccount.findFirst({ where: { code: acc.code } });
      let account = existing;
      if (!existing) {
        const subHead = await this.prisma.subHead.findFirst({ where: { name: acc.subHead } });
        account = await this.prisma.mainAccount.create({
          data: {
            code: acc.code,
            name: acc.name,
            accountType: acc.type,
            subHeadId: subHead?.id ?? null,
            status: 'active',
          },
        });
        this.logger.log(`Created default main account ${acc.name} (${acc.code})`);
      }
      if (acc.settingKey && account) {
        await this.prisma.systemSetting.upsert({
          where: { key_organizationId: { key: acc.settingKey, organizationId: 'default-org' } },
          create: { key: acc.settingKey, value: account.id, organizationId: 'default-org' },
          update: {},
        });
      }
    }
  }

  /**
   * Resolves a configured account id from system settings, falling back to a
   * default account name lookup when the setting is missing.
   */
  async resolveAccount(settingKey: string, fallbackName: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: settingKey },
    });
    if (setting?.value) return setting.value;

    const byName = await this.prisma.mainAccount.findFirst({
      where: { name: fallbackName, status: 'active' },
    });
    return byName?.id ?? null;
  }

  async resolveCashAccount(): Promise<string> {
    const id = await this.resolveAccount('accounting.cash_account', 'Cash Account');
    if (!id) throw new Error('Cash account not configured');
    return id;
  }
}