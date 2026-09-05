import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateTownDto, UpdateTownDto } from '../dto/parties.dto';

@Injectable()
export class TownsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTownDto, actorId?: string) {
    const existing = await this.prisma.town.findFirst({ where: { name: dto.name } });
    if (existing) throw ApiException.duplicateCode('Town name');

    const item = await this.prisma.town.create({
      data: { name: dto.name, city: dto.city ?? null, description: dto.description ?? null, status: dto.status ?? 'active' },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'TOWN', entity: 'Town',
      entityId: item.id, message: `Town ${item.name} created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.town.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.town.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.town.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const item = await this.prisma.town.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Town');
    return item;
  }

  async update(id: string, dto: UpdateTownDto, actorId?: string) {
    await this.findOne(id);
    const item = await this.prisma.town.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'TOWN', entity: 'Town',
      entityId: id, message: `Town ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string, force = false) {
    const item = await this.findOne(id);
    const [customerCount, supplierCount] = await Promise.all([
      this.prisma.customer.count({ where: { townId: id } }),
      this.prisma.supplier.count({ where: { townId: id } }),
    ]);
    const references: string[] = [];
    if (customerCount > 0) references.push(`${customerCount} customer${customerCount === 1 ? '' : 's'}`);
    if (supplierCount > 0) references.push(`${supplierCount} supplier${supplierCount === 1 ? '' : 's'}`);
    if (references.length > 0 && !force) {
      throw ApiException.referencesExist(`Town "${item.name}"`, references);
    }
    await this.prisma.town.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'TOWN', entity: 'Town',
      entityId: id, message: `Town ${item.name} deleted`,
    });
    return { id, deleted: true };
  }
}