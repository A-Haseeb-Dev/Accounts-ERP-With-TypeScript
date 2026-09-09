import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// Prisma Decimals serialize to strings over JSON, which made the browser
// concatenate money values instead of summing them (e.g. Purchase Book total).
// Emit them as plain numbers so every money field behaves in the web app.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON() {
  return Number(this.toString());
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async runInTransaction<T>(
    fn: (tx: any) => Promise<T>,
    timeout = 30000,
  ): Promise<T> {
    return this.$transaction(fn, { timeout });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}