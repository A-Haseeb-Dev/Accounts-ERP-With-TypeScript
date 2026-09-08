import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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