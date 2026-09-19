import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { AttendanceBulkDto, UpsertAttendanceDto } from '../dto/hr.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Normalises a date to UTC midnight so `@@unique([employeeId, date])` has a
   * stable calendar-day key regardless of where the request originated.
   */
  static dayKey(value: string | Date): Date {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async assertEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw ApiException.notFound('Employee');
    return employee;
  }

  async upsert(dto: UpsertAttendanceDto, actorId?: string) {
    await this.assertEmployee(dto.employeeId);
    const date = AttendanceService.dayKey(dto.date);
    const status = dto.status;
    const overtimeHours = dto.overtimeHours ?? 0;
    const note = dto.note ?? null;

    const item = await this.prisma.hrAttendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      create: { employeeId: dto.employeeId, date, status, overtimeHours, note },
      update: { status, overtimeHours, note },
      include: { employee: true },
    });

    this.audit.record({
      userId: actorId,
      action: dto.status === 'absent' ? 'UPDATE' : 'CREATE',
      module: 'HR',
      entity: 'Attendance',
      entityId: item.id,
      message: `Attendance recorded for ${item.employee.fullName} on ${date.toISOString().slice(0, 10)} (${status})`,
    });
    return item;
  }

  async bulkUpsert(dto: AttendanceBulkDto, actorId?: string) {
    const date = AttendanceService.dayKey(dto.date);
    const results = [];
    for (const record of dto.records) {
      await this.assertEmployee(record.employeeId);
      const item = await this.prisma.hrAttendance.upsert({
        where: { employeeId_date: { employeeId: record.employeeId, date } },
        create: {
          employeeId: record.employeeId,
          date,
          status: record.status,
          overtimeHours: record.overtimeHours ?? 0,
          note: record.note ?? null,
        },
        update: {
          status: record.status,
          overtimeHours: record.overtimeHours ?? 0,
          note: record.note ?? null,
        },
      });
      results.push(item);
    }
    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'HR',
      entity: 'Attendance',
      message: `Bulk attendance for ${date.toISOString().slice(0, 10)} (${dto.records.length} record${dto.records.length === 1 ? '' : 's'})`,
    });
    return results;
  }

  /** All employees for a day with their attendance record (or null if unrecorded). */
  async findByDate(dateValue: string | Date) {
    const date = AttendanceService.dayKey(dateValue);
    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: 'active' },
        include: { department: true, designation: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.hrAttendance.findMany({
        where: { date },
        include: { employee: true },
      }),
    ]);
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));
    return employees.map((employee) => ({
      employee,
      attendance: recordMap.get(employee.id) ?? null,
    }));
  }

  async findByEmployee(employeeId: string, query: { page?: number; pageSize?: number; from?: string; to?: string }) {
    await this.assertEmployee(employeeId);
    const { page = 1, pageSize = 25, from, to } = query;
    const where: Record<string, unknown> = { employeeId };
    if (from || to) {
      where.date = {
        ...(from ? { gte: AttendanceService.dayKey(from) } : {}),
        ...(to ? { lte: AttendanceService.dayKey(to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.hrAttendance.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.hrAttendance.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async remove(id: string, actorId?: string) {
    const item = await this.prisma.hrAttendance.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Attendance record');
    await this.prisma.hrAttendance.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Attendance', entityId: id,
      message: `Attendance record deleted`,
    });
    return { id, deleted: true };
  }
}