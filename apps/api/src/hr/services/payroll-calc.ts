export interface PayrollLineInput {
  basicSalary: number;
  allowance: number;
  /** Attendance records for the month: status + overtime hours. */
  attendance: { status: string; overtimeHours: number }[];
  /** Number of calendar days in the pay period. */
  daysInMonth: number;
}

export interface PayrollLineResult {
  basic: number;
  allowance: number;
  overtimeHours: number;
  overtimeAmount: number;
  absentDays: number;
  absentDeduction: number;
  otherDeduction: number;
  taxDeduction: number;
  grossPay: number;
  totalDeduction: number;
  netPay: number;
}

/**
 * Pure payroll calculation used by the payroll generator (and unit-tested here).
 *
 * - basic + fixed allowance are always paid in full
 * - overtime hours earn (basic / (days * 8)) per hour
 * - absent days are deducted at (basic / days) per day; half-days count as 0.5
 */
export function computePayrollLine(input: PayrollLineInput): PayrollLineResult {
  const { basicSalary, allowance, attendance, daysInMonth } = input;
  const days = Math.max(1, daysInMonth);

  const basic = round2(basicSalary);
  const allowanceAmount = round2(allowance);

  const overtimeHours = round2(
    attendance.reduce((sum, a) => sum + Number(a.overtimeHours ?? 0), 0),
  );
  const hourlyRate = basic > 0 ? basic / (days * 8) : 0;
  const overtimeAmount = round2(overtimeHours * hourlyRate);

  const absentDays = round2(
    attendance.reduce(
      (sum, a) => sum + (a.status === 'absent' ? 1 : a.status === 'half_day' ? 0.5 : 0),
      0,
    ),
  );
  const perDay = basic > 0 ? basic / days : 0;
  const absentDeduction = round2(perDay * absentDays);

  const grossPay = round2(basic + allowanceAmount + overtimeAmount);
  const totalDeduction = round2(absentDeduction);
  const netPay = round2(grossPay - totalDeduction);

  return {
    basic,
    allowance: allowanceAmount,
    overtimeHours,
    overtimeAmount,
    absentDays,
    absentDeduction,
    otherDeduction: 0,
    taxDeduction: 0,
    grossPay,
    totalDeduction,
    netPay,
  };
}

export function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}