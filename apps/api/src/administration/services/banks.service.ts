import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../dto/banks.dto';

const ENTITY = 'Bank account';

@Injectable()
export class BanksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateBankAccountDto, actorId?: string) {
    await this.assertMainAccount(dto.mainAccountId);
    const item = await this.prisma.bankAccount.create({
      data: {
        name: dto.name,
        accountTitle: dto.accountTitle ?? null,
        accountNumber: dto.accountNumber ?? null,
        mainAccountId: dto.mainAccountId ?? null,
        status: dto.status ?? 'active',
      },
      include: { mainAccount: true },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'BANK', entity: 'BankAccount',
      entityId: item.id, message: `Bank account ${item.name} created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where,
        include: { mainAccount: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bankAccount.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  findAllFlat() {
    return this.prisma.bankAccount.findMany({
      where: { status: 'active' },
      include: { mainAccount: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { mainAccount: true },
    });
    if (!item) throw ApiException.notFound(ENTITY);
    return item;
  }

  async update(id: string, dto: UpdateBankAccountDto, actorId?: string) {
    await this.findOne(id);
    await this.assertMainAccount(dto.mainAccountId);
    const item = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name,
        accountTitle: dto.accountTitle,
        accountNumber: dto.accountNumber,
        mainAccountId: dto.mainAccountId,
        status: dto.status,
      },
      include: { mainAccount: true },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'BANK', entity: 'BankAccount',
      entityId: id, message: `Bank account ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const references = await this.prisma.paymentEntry.count({ where: { bankAccountId: id } });
    if (references > 0) {
      throw ApiException.referencesExist(`Bank account "${item.name}"`, [
        `${references} payment entr${references === 1 ? 'y' : 'ies'}`,
      ]);
    }
    await this.prisma.bankAccount.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'BANK', entity: 'BankAccount',
      entityId: id, message: `Bank account ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  private async assertMainAccount(id?: string) {
    if (!id) return;
    const account = await this.prisma.mainAccount.findUnique({ where: { id } });
    if (!account) throw ApiException.notFound('Main account');
  }
}