import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveDto,
  UpdateLeaveTypeDto,
} from '../dto/hr.dto';
import { AttendanceService } from './attendance.service';

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Leave types ----------

  private async assertTypeUnique(name: string, ignoreId?: string) {
    const existing = await this.prisma.hrLeaveType.findFirst({ where: { name } });
    if (existing && existing.id !== ignoreId) throw ApiException.duplicateCode('Leave type name');
  }

  async createLeaveType(dto: CreateLeaveTypeDto, actorId?: string) {
    await this.assertTypeUnique(dto.name);
    const item = await this.prisma.hrLeaveType.create({
      data: {
        name: dto.name,
        paid: dto.paid ?? true,
        annualQuota: dto.annualQuota ?? 0,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Leave type',
      entityId: item.id, message: `Leave type ${item.name} created`,
    });
    return item;
  }

  async findAllLeaveTypes(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.hrLeaveType.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.hrLeaveType.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllLeaveTypesFlat() {
    return this.prisma.hrLeaveType.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
    });
  }

  /** Leave balances (quota / used / remaining) per employee and leave type for a year. */
  async balances(employeeId?: string, year?: number) {
    const usedYear = year ?? new Date().getFullYear();
    const [leaveTypes, employees, requests] = await Promise.all([
      this.prisma.hrLeaveType.findMany({
        where: { status: 'active' },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { status: 'active', ...(employeeId ? { id: employeeId } : {}) },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, fullName: true },
      }),
      this.prisma.hrLeaveRequest.findMany({
        where: {
          status: 'approved',
          fromDate: { gte: new Date(Date.UTC(usedYear, 0, 1)) },
          toDate: { lte: new Date(Date.UTC(usedYear, 11, 31, 23, 59, 59, 999)) },
        },
        select: { employeeId: true, leaveTypeId: true, days: true },
      }),
    ]);

    const byEmployee = new Map<string, Map<string, number>>();
    for (const r of requests) {
      const m = byEmployee.get(r.employeeId) ?? new Map<string, number>();
      m.set(r.leaveTypeId, (m.get(r.leaveTypeId) ?? 0) + Number(r.days));
      byEmployee.set(r.employeeId, m);
    }

    const rows = employees.map((e) => ({
      employeeId: e.id,
      code: e.code,
      employeeName: e.fullName,
      balances: leaveTypes.map((lt) => {
        const used = byEmployee.get(e.id)?.get(lt.id) ?? 0;
        const quota = lt.annualQuota;
        return {
          leaveTypeId: lt.id,
          name: lt.name,
          paid: lt.paid,
          quota,
          used: Math.round(used * 10) / 10,
          remaining: Math.max(0, Math.round((quota - used) * 10) / 10),
        };
      }),
    }));
    return { year: usedYear, items: rows };
  }

  async findOneLeaveType(id: string) {
    const item = await this.prisma.hrLeaveType.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Leave type');
    return item;
  }

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto, actorId?: string) {
    await this.findOneLeaveType(id);
    if (dto.name) await this.assertTypeUnique(dto.name, id);
    const item = await this.prisma.hrLeaveType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.paid !== undefined ? { paid: dto.paid } : {}),
        ...(dto.annualQuota !== undefined ? { annualQuota: dto.annualQuota } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Leave type',
      entityId: id, message: `Leave type ${item.name} updated`,
    });
    return item;
  }

  async removeLeaveType(id: string, actorId?: string) {
    const item = await this.findOneLeaveType(id);
    const requests = await this.prisma.hrLeaveRequest.count({ where: { leaveTypeId: id } });
    if (requests) {
      throw ApiException.deleteBlocked(`Leave type "${item.name}"`, [
        `${requests} leave request${requests === 1 ? '' : 's'}`,
      ]);
    }
    await this.prisma.hrLeaveType.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Leave type',
      entityId: id, message: `Leave type ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  // ---------- Leave requests ----------

  static daysBetween(from: string | Date, to: string | Date): number {
    const start = new Date(from);
    const end = new Date(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const ms = end.getTime() - start.getTime();
    if (ms < 0) throw ApiException.validation('"To" date must be on or after the "from" date');
    return Math.floor(ms / 86_400_000) + 1;
  }

  async createRequest(dto: CreateLeaveRequestDto, actorId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, status: 'active' },
    });
    if (!employee) throw ApiException.notFound('Employee');
    const leaveType = await this.prisma.hrLeaveType.findFirst({
      where: { id: dto.leaveTypeId, status: 'active' },
    });
    if (!leaveType) throw ApiException.notFound('Leave type');

    const days = LeavesService.daysBetween(dto.fromDate, dto.toDate);
    const item = await this.prisma.hrLeaveRequest.create({
      data: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
        days,
        reason: dto.reason ?? null,
      },
      include: { employee: true, leaveType: true },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Leave request',
      entityId: item.id, message: `Leave request for ${employee.fullName} (${days} day${days === 1 ? '' : 's'}) created`,
    });
    return item;
  }

  async findAllRequests(query: { page?: number; pageSize?: number; status?: string; employeeId?: string; from?: string; to?: string }) {
    const { page = 1, pageSize = 25, status, employeeId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.fromDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.hrLeaveRequest.findMany({
        where,
        include: { employee: { include: { department: true } }, leaveType: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.hrLeaveRequest.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOneRequest(id: string) {
    const item = await this.prisma.hrLeaveRequest.findUnique({
      where: { id },
      include: { employee: { include: { department: true, designation: true } }, leaveType: true },
    });
    if (!item) throw ApiException.notFound('Leave request');
    return item;
  }

  /** Approves or rejects a request. On approval, attendance is marked "leave" for each day. */
  async decide(id: string, dto: DecideLeaveDto, actorId?: string) {
    const request = await this.findOneRequest(id);
    if (request.status !== 'pending') {
      throw ApiException.invalidTransaction(`This request has already been ${request.status}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.hrLeaveRequest.update({
        where: { id },
        data: {
          status: dto.status,
          decidedById: actorId ?? null,
          decidedAt: new Date(),
          decisionNote: dto.note ?? null,
        },
        include: { employee: { include: { department: true } }, leaveType: true },
      });

      if (dto.status === 'approved' && request.leaveType.paid) {
        const start = new Date(request.fromDate);
        const end = new Date(request.toDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        const ops = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const day = AttendanceService.dayKey(d);
          ops.push(
            tx.hrAttendance.upsert({
              where: { employeeId_date: { employeeId: request.employeeId, date: day } },
              create: { employeeId: request.employeeId, date: day, status: 'leave' },
              update: {},
            }),
          );
        }
        await Promise.all(ops);
      }
      return updated;
    });

    this.audit.record({
      userId: actorId, action: 'APPROVE', module: 'HR', entity: 'Leave request',
      entityId: id, message: `Leave request for ${request.employee.fullName} ${dto.status}`,
    });
    return result;
  }

  async removeRequest(id: string, actorId?: string) {
    const request = await this.findOneRequest(id);
    if (request.status !== 'pending') {
      throw ApiException.invalidTransaction('Only pending leave requests can be deleted');
    }
    await this.prisma.hrLeaveRequest.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Leave request',
      entityId: id, message: `Leave request for ${request.employee.fullName} deleted`,
    });
    return { id, deleted: true };
  }
}