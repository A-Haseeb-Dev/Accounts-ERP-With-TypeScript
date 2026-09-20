import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import {
  AttendanceController,
  DepartmentsController,
  DesignationsController,
  EmployeesController,
  LeaveRequestsController,
  LeaveTypesController,
  LoansController,
  PayrollController,
  SalaryComponentsController,
} from './hr.controller';
import { DepartmentsService } from './services/departments.service';
import { DesignationsService } from './services/designations.service';
import { EmployeesService } from './services/employees.service';
import { AttendanceService } from './services/attendance.service';
import { LeavesService } from './services/leaves.service';
import { PayrollService } from './services/payroll.service';
import { SalaryComponentsService } from './services/salary-components.service';
import { LoansService } from './services/loans.service';

@Module({
  imports: [FeaturesModule],
  controllers: [
    DepartmentsController,
    DesignationsController,
    EmployeesController,
    AttendanceController,
    LeaveTypesController,
    LeaveRequestsController,
    PayrollController,
    SalaryComponentsController,
    LoansController,
  ],
  providers: [
    DepartmentsService,
    DesignationsService,
    EmployeesService,
    AttendanceService,
    LeavesService,
    PayrollService,
    SalaryComponentsService,
    LoansService,
  ],
  exports: [EmployeesService],
})
export class HrModule {}