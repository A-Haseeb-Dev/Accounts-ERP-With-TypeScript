import { Module } from '@nestjs/common';
import {
  AttendanceController,
  DepartmentsController,
  DesignationsController,
  EmployeesController,
  LeaveRequestsController,
  LeaveTypesController,
  PayrollController,
} from './hr.controller';
import { DepartmentsService } from './services/departments.service';
import { DesignationsService } from './services/designations.service';
import { EmployeesService } from './services/employees.service';
import { AttendanceService } from './services/attendance.service';
import { LeavesService } from './services/leaves.service';
import { PayrollService } from './services/payroll.service';

@Module({
  controllers: [
    DepartmentsController,
    DesignationsController,
    EmployeesController,
    AttendanceController,
    LeaveTypesController,
    LeaveRequestsController,
    PayrollController,
  ],
  providers: [
    DepartmentsService,
    DesignationsService,
    EmployeesService,
    AttendanceService,
    LeavesService,
    PayrollService,
  ],
  exports: [EmployeesService],
})
export class HrModule {}