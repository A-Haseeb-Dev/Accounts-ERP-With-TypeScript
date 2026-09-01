import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Safe sequential numbering for documents (invoices, vouchers, etc.).
 * Numbers are generated collision-free inside database transactions
 * by reading the current sequence and incrementing it in the same tx.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates the next number for a system setting key that holds a
   * zero-padded sequence counter, e.g. `numbering.sales` => SI-000001.
   */
  async next(
    settingKey: string,
    prefix: string,
    tx?: any,
    padLength = 6,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const key = `numbering.${settingKey}`;

    const [setting] = await client.systemSetting.findMany({
      where: { key },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });

    let nextValue = 1;
    if (setting?.value) {
      nextValue = Number(setting.value) + 1;
    }

    await client.systemSetting.upsert({
      where: { key_organizationId: { key, organizationId: 'default-org' } },
      create: { key, value: String(nextValue), organizationId: 'default-org' },
      update: { value: String(nextValue) },
    });

    return `${prefix}-${String(nextValue).padStart(padLength, '0')}`;
  }
}