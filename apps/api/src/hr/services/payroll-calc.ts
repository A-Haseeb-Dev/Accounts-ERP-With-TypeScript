export interface PayrollComponentInput {
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  calcType: 'FIXED' | 'PERCENT_BASIC';
  value: number;
  amount?: number;
}

export interface PayrollBreakdownItem {
  name: string;
  type: string;
  amount: number;
}

export interface PayrollLineInput {
  basicSalary: number;
  allowance: number;
  /** Attendance records for the month: status + overtime hours. */
  attendance: { status: string; overtimeHours: number }[];
  /** Number of calendar days in the pay period. */
  daysInMonth: number;
  /** Active salary components (with per-employee overrides already resolved). */
  components?: PayrollComponentInput[];
  /** Monthly loan installments active for the employee this period. */
  loanInstallments?: number[];
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
  componentBreakdown: PayrollBreakdownItem[];
}

/**
 * Pure payroll calculation used by the payroll generator (and unit-tested here).
 *
 * - basic + fixed allowance are always paid in full
 * - overtime hours earn (basic / (days * 8)) per hour
 * - absent days are deducted at (basic / days) per day; half-days count as 0.5
 * - configurable EARNING components add to gross (FIXED amount or % of basic)
 * - configurable DEDUCTION components reduce pay (FIXED amount or % of basic)
 * - active loan installments are deducted as well
 */
export function computePayrollLine(input: PayrollLineInput): PayrollLineResult {
  const { basicSalary, allowance, attendance, daysInMonth } = input;
  const components = input.components ?? [];
  const loanInstallments = input.loanInstallments ?? [];
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

  const earnings: PayrollBreakdownItem[] = [];
  const deductionBreakdown: PayrollBreakdownItem[] = [];
  let otherDeduction = 0;
  for (const c of components) {
    const amount =
      c.calcType === 'PERCENT_BASIC' ? round2((c.value / 100) * basic) : round2(c.amount ?? c.value);
    if (c.type === 'EARNING') {
      earnings.push({ name: c.name, type: 'EARNING', amount });
    } else {
      otherDeduction = round2(otherDeduction + amount);
      deductionBreakdown.push({ name: c.name, type: 'DEDUCTION', amount });
    }
  }
  const earningsTotal = earnings.reduce((sum, e) => sum + e.amount, 0);

  const loanTotal = round2(loanInstallments.reduce((sum, a) => sum + a, 0));
  if (loanTotal > 0) {
    otherDeduction = round2(otherDeduction + loanTotal);
    deductionBreakdown.push({ name: 'Loan/Advance', type: 'DEDUCTION', amount: loanTotal });
  }

  const grossPay = round2(basic + allowanceAmount + overtimeAmount + earningsTotal);
  const totalDeduction = round2(absentDeduction + otherDeduction);
  const netPay = round2(grossPay - totalDeduction);

  const componentBreakdown: PayrollBreakdownItem[] = [
    { name: 'Basic', type: 'EARNING', amount: basic },
    { name: 'Allowance', type: 'EARNING', amount: allowanceAmount },
  ];
  if (overtimeAmount > 0) componentBreakdown.push({ name: 'Overtime', type: 'EARNING', amount: overtimeAmount });
  componentBreakdown.push(...earnings);
  if (absentDeduction > 0) componentBreakdown.push({ name: 'Absent Deduction', type: 'DEDUCTION', amount: absentDeduction });
  componentBreakdown.push(...deductionBreakdown);

  return {
    basic,
    allowance: allowanceAmount,
    overtimeHours,
    overtimeAmount,
    absentDays,
    absentDeduction,
    otherDeduction,
    taxDeduction: 0,
    grossPay,
    totalDeduction,
    netPay,
    componentBreakdown,
  };
}

export function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}