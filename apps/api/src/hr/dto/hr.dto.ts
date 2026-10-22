import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepartmentDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @MaxLength(150) name: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
}

export class UpdateDepartmentDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @IsOptional() @MaxLength(150) name?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
}

export class CreateDesignationDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @MaxLength(150) name: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() status?: string;
}

export class UpdateDesignationDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @IsOptional() @MaxLength(150) name?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() status?: string;
}

export class CreateEmployeeDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @MaxLength(150) fullName: string;
  @IsString() @IsOptional() @MaxLength(150) fatherName?: string;
  @IsString() @IsOptional() @MaxLength(30) cnic?: string;
  @IsString() @IsOptional() @MaxLength(50) phone?: string;
  @IsString() @IsOptional() @MaxLength(150) email?: string;
  @IsString() @IsOptional() @MaxLength(500) address?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() designationId?: string;
  @IsDateString() @IsOptional() joinDate?: string;
  @IsString() @IsOptional() employmentType?: string;
  @IsNumber() @IsOptional() basicSalary?: number;
  @IsNumber() @IsOptional() allowance?: number;
  @IsString() @IsOptional() bankName?: string;
  @IsString() @IsOptional() bankAccount?: string;
  @IsString() @IsOptional() mainAccountId?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
  @IsDateString() @IsOptional() exitDate?: string;
  @IsString() @IsOptional() @MaxLength(500) exitReason?: string;
}

export class UpdateEmployeeDto {
  @IsString() @IsOptional() @MaxLength(50) code?: string;
  @IsString() @IsOptional() @MaxLength(150) fullName?: string;
  @IsString() @IsOptional() @MaxLength(150) fatherName?: string;
  @IsString() @IsOptional() @MaxLength(30) cnic?: string;
  @IsString() @IsOptional() @MaxLength(50) phone?: string;
  @IsString() @IsOptional() @MaxLength(150) email?: string;
  @IsString() @IsOptional() @MaxLength(500) address?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() designationId?: string;
  @IsDateString() @IsOptional() joinDate?: string;
  @IsString() @IsOptional() employmentType?: string;
  @IsNumber() @IsOptional() basicSalary?: number;
  @IsNumber() @IsOptional() allowance?: number;
  @IsString() @IsOptional() bankName?: string;
  @IsString() @IsOptional() bankAccount?: string;
  @IsString() @IsOptional() mainAccountId?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
  @IsDateString() @IsOptional() exitDate?: string;
  @IsString() @IsOptional() @MaxLength(500) exitReason?: string;
}

export class CreateSalaryComponentDto {
  @IsString() @MaxLength(150) name: string;
  @IsIn(['EARNING', 'DEDUCTION']) type: 'EARNING' | 'DEDUCTION';
  @IsIn(['FIXED', 'PERCENT_BASIC']) calcType: 'FIXED' | 'PERCENT_BASIC';
  @IsNumber() @Min(0) value: number;
  @IsString() @IsOptional() status?: string;
  @IsInt() @IsOptional() sortOrder?: number;
}

export class UpdateSalaryComponentDto {
  @IsString() @IsOptional() @MaxLength(150) name?: string;
  @IsIn(['EARNING', 'DEDUCTION']) @IsOptional() type?: 'EARNING' | 'DEDUCTION';
  @IsIn(['FIXED', 'PERCENT_BASIC']) @IsOptional() calcType?: 'FIXED' | 'PERCENT_BASIC';
  @IsNumber() @IsOptional() @Min(0) value?: number;
  @IsString() @IsOptional() status?: string;
  @IsInt() @IsOptional() sortOrder?: number;
}

export class SalaryStructureItemDto {
  @IsString() componentId: string;
  @IsNumber() @Min(0) amount: number;
}

export class UpdateSalaryStructureDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryStructureItemDto)
  items: SalaryStructureItemDto[];
}

export class CreateEmployeeLoanDto {
  @IsString() employeeId: string;
  @IsNumber() @Min(0) amount: number;
  @IsNumber() @Min(0) installment: number;
  @IsInt() @Min(1) startMonth: number;
  @IsInt() @Min(2000) startYear: number;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class UpdateEmployeeLoanDto {
  @IsNumber() @IsOptional() @Min(0) amount?: number;
  @IsNumber() @IsOptional() @Min(0) installment?: number;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class CreateSalaryRecordDto {
  @IsString() employeeId: string;
  @IsNumber() @Min(0) basicSalary: number;
  @IsNumber() @Min(0) allowance: number;
  @IsDateString() effectiveDate: string;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

/**
 * Ends an employee's employment without erasing them.
 *
 * The employee is kept, and marked inactive with the leaving date and reason,
 * so their attendance, leave history and the payroll runs they were part of
 * stay intact and still add up.
 */
export class DeactivateEmployeeDto {
  @IsDateString() @IsOptional() exitDate?: string;
  @IsString() @IsOptional() @MaxLength(500) exitReason?: string;
}

export class DisbursePayrollDto {
  @IsString() @IsOptional() bankAccountId?: string;
  /**
   * The account the money actually leaves. Defaults to the run's funding
   * account, so the pot the operator funded is the pot the salaries come out
   * of. A bank account may be named instead when the payment goes out of a
   * different account.
   */
  @IsString() @IsOptional() settlementAccountId?: string;
}

export class CreateLeaveTypeDto {
  @IsString() @MaxLength(150) name: string;
  @IsBoolean() @IsOptional() paid?: boolean;
  @IsInt() @IsOptional() @Min(0) annualQuota?: number;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
}

export class UpdateLeaveTypeDto {
  @IsString() @IsOptional() @MaxLength(150) name?: string;
  @IsBoolean() @IsOptional() paid?: boolean;
  @IsInt() @IsOptional() @Min(0) annualQuota?: number;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() status?: string;
}

export class CreateLeaveRequestDto {
  @IsString() employeeId: string;
  @IsString() leaveTypeId: string;
  @IsDateString() fromDate: string;
  @IsDateString() toDate: string;
  @IsString() @IsOptional() @MaxLength(500) reason?: string;
}

export class DecideLeaveDto {
  @IsIn(['approved', 'rejected']) status: 'approved' | 'rejected';
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class UpsertAttendanceDto {
  @IsString() employeeId: string;
  @IsDateString() date: string;
  @IsIn(['present', 'absent', 'leave', 'half_day', 'holiday']) status: string;
  @IsNumber() @IsOptional() @Min(0) overtimeHours?: number;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class AttendanceBulkRowDto {
  @IsString() employeeId: string;
  @IsIn(['present', 'absent', 'leave', 'half_day', 'holiday']) status: string;
  @IsNumber() @IsOptional() @Min(0) overtimeHours?: number;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class AttendanceBulkDto {
  @IsDateString() date: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceBulkRowDto)
  records: AttendanceBulkRowDto[];
}

/**
 * Edits a single attendance record. The employee and the day cannot change -
 * only what was recorded about them - so a correction cannot silently move a
 * record to another person or another date.
 */
export class UpdateAttendanceDto {
  @IsIn(['present', 'absent', 'leave', 'half_day', 'holiday']) @IsOptional() status?: string;
  @IsNumber() @IsOptional() @Min(0) overtimeHours?: number;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

/** Clears one whole day of attendance. */
export class DeleteAttendanceDayDto {
  @IsDateString() date: string;
}

export class GeneratePayrollDto {
  @IsInt() @Min(1) periodMonth: number;
  @IsInt() @Min(2000) periodYear: number;
  @IsDateString() @IsOptional() payDate?: string;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
  @IsString() @IsOptional() fundingAccountId?: string;
  /**
   * How far the run goes in one operation.
   *
   * `draft` only creates the run. `post` also books the accrual against the
   * employee accounts. `post_and_pay` books the accrual *and* pays it out of
   * the funding account, in a single transaction - the money is deducted from
   * the funding account and credited to the employee accounts together, so a
   * failure cannot leave one half applied.
   */
  @IsIn(['draft', 'post', 'post_and_pay']) @IsOptional()
  mode?: 'draft' | 'post' | 'post_and_pay';
  /** The account the money is paid out of. Defaults to the funding account. */
  @IsString() @IsOptional() settlementAccountId?: string;
}

export class UpdatePayrollItemDto {
  @IsString() id: string;
  @IsNumber() @IsOptional() @Min(0) overtimeHours?: number;
  @IsNumber() @IsOptional() @Min(0) otherDeduction?: number;
  @IsNumber() @IsOptional() @Min(0) taxDeduction?: number;
}

export class UpdatePayrollItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePayrollItemDto)
  items: UpdatePayrollItemDto[];
}

export class CancelPayrollDto {
  @IsString() @MaxLength(500) reason: string;
}
