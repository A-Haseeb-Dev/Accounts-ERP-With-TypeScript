import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DepartmentsService } from './services/departments.service';
import { DesignationsService } from './services/designations.service';
import { EmployeesService } from './services/employees.service';
import { AttendanceService } from './services/attendance.service';
import { LeavesService } from './services/leaves.service';
import { PayrollService } from './services/payroll.service';
import {
  AttendanceBulkDto,
  CancelPayrollDto,
  CreateDepartmentDto,
  CreateDesignationDto,
  CreateEmployeeDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveDto,
  GeneratePayrollDto,
  UpdateDepartmentDto,
  UpdateDesignationDto,
  UpdateEmployeeDto,
  UpdateLeaveTypeDto,
  UpdatePayrollItemsDto,
  UpsertAttendanceDto,
} from './dto/hr.dto';

@ApiTags('HR - Departments')
@ApiBearerAuth()
@Controller('hr/departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Post() @Permissions('hr.departments.create') @ApiOperation({ summary: 'Create a department' })
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('hr.departments.view') @ApiOperation({ summary: 'List departments' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('hr.departments.view') @ApiOperation({ summary: 'List departments (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get('next-code') @Permissions('hr.departments.view') @ApiOperation({ summary: 'Next auto-generated department code' })
  async nextCode() { const code = await this.service.previewCode(); return code ? { code } : {}; }
  @Get(':id') @Permissions('hr.departments.view') @ApiOperation({ summary: 'Get a department' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') @Permissions('hr.departments.update') @ApiOperation({ summary: 'Update a department' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('hr.departments.delete') @ApiOperation({ summary: 'Deactivate a department' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('HR - Designations')
@ApiBearerAuth()
@Controller('hr/designations')
export class DesignationsController {
  constructor(private readonly service: DesignationsService) {}

  @Post() @Permissions('hr.designations.create') @ApiOperation({ summary: 'Create a designation' })
  create(@Body() dto: CreateDesignationDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('hr.designations.view') @ApiOperation({ summary: 'List designations' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('departmentId') departmentId?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, departmentId });
  }
  @Get('flat') @Permissions('hr.designations.view') @ApiOperation({ summary: 'List designations (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get('next-code') @Permissions('hr.designations.view') @ApiOperation({ summary: 'Next auto-generated designation code' })
  async nextCode() { const code = await this.service.previewCode(); return code ? { code } : {}; }
  @Get(':id') @Permissions('hr.designations.view') @ApiOperation({ summary: 'Get a designation' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') @Permissions('hr.designations.update') @ApiOperation({ summary: 'Update a designation' })
  update(@Param('id') id: string, @Body() dto: UpdateDesignationDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('hr.designations.delete') @ApiOperation({ summary: 'Delete a designation' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('HR - Employees')
@ApiBearerAuth()
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Post() @Permissions('hr.employees.create') @ApiOperation({ summary: 'Create an employee' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('hr.employees.view') @ApiOperation({ summary: 'List employees' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('departmentId') departmentId?: string, @Query('designationId') designationId?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, departmentId, designationId });
  }
  @Get('flat') @Permissions('hr.employees.view') @ApiOperation({ summary: 'List employees (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get('next-code') @Permissions('hr.employees.view') @ApiOperation({ summary: 'Next auto-generated employee code' })
  async nextCode() { const code = await this.service.previewCode(); return code ? { code } : {}; }
  @Get(':id') @Permissions('hr.employees.view') @ApiOperation({ summary: 'Get an employee' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') @Permissions('hr.employees.update') @ApiOperation({ summary: 'Update an employee' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('hr.employees.delete') @ApiOperation({ summary: 'Delete an employee' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('HR - Attendance')
@ApiBearerAuth()
@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post() @Permissions('hr.attendance.manage') @ApiOperation({ summary: 'Record / update one attendance' })
  upsert(@Body() dto: UpsertAttendanceDto, @CurrentUser() actor: any) { return this.service.upsert(dto, actor?.id); }
  @Post('bulk') @Permissions('hr.attendance.manage') @ApiOperation({ summary: 'Record attendance for many employees on one day' })
  bulk(@Body() dto: AttendanceBulkDto, @CurrentUser() actor: any) { return this.service.bulkUpsert(dto, actor?.id); }
  @Get('by-day') @Permissions('hr.attendance.view') @ApiOperation({ summary: 'Attendance sheet for one day' })
  byDay(@Query('date') date?: string) { return this.service.findByDate(date ?? new Date().toISOString()); }
  @Get('employee/:employeeId') @Permissions('hr.attendance.view') @ApiOperation({ summary: 'Attendance history of an employee' })
  employee(@Param('employeeId') employeeId: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findByEmployee(employeeId, { page: Number(page), pageSize: Number(pageSize), from, to });
  }
  @Delete(':id') @Permissions('hr.attendance.manage') @ApiOperation({ summary: 'Delete an attendance record' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('HR - Leaves')
@ApiBearerAuth()
@Controller('hr/leave-types')
export class LeaveTypesController {
  constructor(private readonly service: LeavesService) {}

  @Post() @Permissions('hr.leaves.create') @ApiOperation({ summary: 'Create a leave type' })
  create(@Body() dto: CreateLeaveTypeDto, @CurrentUser() actor: any) { return this.service.createLeaveType(dto, actor?.id); }
  @Get() @Permissions('hr.leaves.view') @ApiOperation({ summary: 'List leave types' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAllLeaveTypes({ page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('hr.leaves.view') @ApiOperation({ summary: 'List leave types (for selects)' })
  findAllFlat() { return this.service.findAllLeaveTypesFlat(); }
  @Get(':id') @Permissions('hr.leaves.view') @ApiOperation({ summary: 'Get a leave type' })
  findOne(@Param('id') id: string) { return this.service.findOneLeaveType(id); }
  @Patch(':id') @Permissions('hr.leaves.update') @ApiOperation({ summary: 'Update a leave type' })
  update(@Param('id') id: string, @Body() dto: UpdateLeaveTypeDto, @CurrentUser() actor: any) { return this.service.updateLeaveType(id, dto, actor?.id); }
  @Delete(':id') @Permissions('hr.leaves.delete') @ApiOperation({ summary: 'Delete a leave type' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.removeLeaveType(id, actor?.id); }
}

@ApiTags('HR - Leave Requests')
@ApiBearerAuth()
@Controller('hr/leaves')
export class LeaveRequestsController {
  constructor(private readonly service: LeavesService) {}

  @Post() @Permissions('hr.leaves.create') @ApiOperation({ summary: 'Create a leave request' })
  create(@Body() dto: CreateLeaveRequestDto, @CurrentUser() actor: any) { return this.service.createRequest(dto, actor?.id); }
  @Get() @Permissions('hr.leaves.view') @ApiOperation({ summary: 'List leave requests' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('status') status?: string, @Query('employeeId') employeeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAllRequests({ page: Number(page), pageSize: Number(pageSize), status, employeeId, from, to });
  }
  @Get(':id') @Permissions('hr.leaves.view') @ApiOperation({ summary: 'Get a leave request' })
  findOne(@Param('id') id: string) { return this.service.findOneRequest(id); }
  @Post(':id/decide') @Permissions('hr.leaves.approve') @ApiOperation({ summary: 'Approve or reject a leave request' })
  decide(@Param('id') id: string, @Body() dto: DecideLeaveDto, @CurrentUser() actor: any) { return this.service.decide(id, dto, actor?.id); }
  @Delete(':id') @Permissions('hr.leaves.delete') @ApiOperation({ summary: 'Delete a pending leave request' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.removeRequest(id, actor?.id); }
}

@ApiTags('HR - Payroll')
@ApiBearerAuth()
@Controller('hr/payroll')
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Post() @Permissions('hr.payroll.create') @ApiOperation({ summary: 'Generate a payroll run for a period' })
  generate(@Body() dto: GeneratePayrollDto, @CurrentUser() actor: any) { return this.service.generate(dto, actor?.id); }
  @Get() @Permissions('hr.payroll.view') @ApiOperation({ summary: 'List payroll runs' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('status') status?: string, @Query('year') year?: string, @Query('month') month?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), status, year, month });
  }
  @Get('next-code') @Permissions('hr.payroll.view') @ApiOperation({ summary: 'Next auto-generated payroll number' })
  async nextCode() { const code = await this.service.previewCode(); return code ? { code } : {}; }
  @Get(':id') @Permissions('hr.payroll.view') @ApiOperation({ summary: 'Get a payroll run with items' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id/items') @Permissions('hr.payroll.update') @ApiOperation({ summary: 'Adjust payroll items (overtime / deductions)' })
  updateItems(@Param('id') id: string, @Body() dto: UpdatePayrollItemsDto, @CurrentUser() actor: any) { return this.service.updateItems(id, dto, actor?.id); }
  @Post(':id/post') @Permissions('hr.payroll.post') @ApiOperation({ summary: 'Post payroll to accounting' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }
  @Post(':id/cancel') @Permissions('hr.payroll.cancel') @ApiOperation({ summary: 'Cancel a posted payroll' })
  cancel(@Param('id') id: string, @Body() dto: CancelPayrollDto, @CurrentUser() actor: any) { return this.service.cancel(id, dto.reason, actor?.id); }
  @Delete(':id') @Permissions('hr.payroll.delete') @ApiOperation({ summary: 'Delete a draft payroll' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}