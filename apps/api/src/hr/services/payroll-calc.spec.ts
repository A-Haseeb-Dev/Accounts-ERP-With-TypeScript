import { describe, it, expect } from 'vitest';
import { computePayrollLine, daysInMonth } from './payroll-calc';

describe('daysInMonth', () => {
  it('knows short and long months', () => {
    expect(daysInMonth(2, 2026)).toBe(28);
    expect(daysInMonth(1, 2026)).toBe(31);
    expect(daysInMonth(4, 2026)).toBe(30);
  });
});

describe('computePayrollLine', () => {
  it('pays basic salary in full with no attendance data', () => {
    const line = computePayrollLine({ basicSalary: 30000, allowance: 0, attendance: [], daysInMonth: 30 });
    expect(line.basic).toBe(30000);
    expect(line.grossPay).toBe(30000);
    expect(line.totalDeduction).toBe(0);
    expect(line.netPay).toBe(30000);
  });

  it('adds the fixed allowance to gross pay', () => {
    const line = computePayrollLine({ basicSalary: 30000, allowance: 5000, attendance: [], daysInMonth: 30 });
    expect(line.grossPay).toBe(35000);
    expect(line.netPay).toBe(35000);
  });

  it('deducts absent days at the daily rate', () => {
    const line = computePayrollLine({
      basicSalary: 30000,
      allowance: 0,
      attendance: [{ status: 'absent', overtimeHours: 0 }, { status: 'absent', overtimeHours: 0 }],
      daysInMonth: 30,
    });
    expect(line.absentDays).toBe(2);
    expect(line.absentDeduction).toBe(2000);
    expect(line.grossPay).toBe(30000);
    expect(line.netPay).toBe(28000);
  });

  it('counts half days as half an absence', () => {
    const line = computePayrollLine({
      basicSalary: 30000,
      allowance: 0,
      attendance: [{ status: 'half_day', overtimeHours: 0 }],
      daysInMonth: 30,
    });
    expect(line.absentDays).toBe(0.5);
    expect(line.absentDeduction).toBe(500);
  });

  it('ignores leaves and holidays for absences but still counts overtime', () => {
    const line = computePayrollLine({
      basicSalary: 30000,
      allowance: 0,
      attendance: [
        { status: 'leave', overtimeHours: 0 },
        { status: 'holiday', overtimeHours: 0 },
        { status: 'present', overtimeHours: 8 },
      ],
      daysInMonth: 30,
    });
    expect(line.absentDays).toBe(0);
    expect(line.absentDeduction).toBe(0);
    // daily rate 1000 / 8 hours = 125/hr * 8 hours
    expect(line.overtimeAmount).toBe(1000);
    expect(line.netPay).toBe(31000);
  });

  it('rounds to two decimals', () => {
    const line = computePayrollLine({
      basicSalary: 100000,
      allowance: 0,
      attendance: [{ status: 'present', overtimeHours: 3 }],
      daysInMonth: 31,
    });
    // daily = 100000 / 31 = 3225.81, hourly = 403.23 -> overtime 3h = 1209.68
    expect(line.overtimeAmount).toBe(1209.68);
    expect(line.netPay).toBe(101209.68);
  });

  it('adds FIXED earning components and PERCENT_BASIC earning components', () => {
    const line = computePayrollLine({
      basicSalary: 100000,
      allowance: 5000,
      attendance: [],
      daysInMonth: 30,
      components: [
        { name: 'House Rent', type: 'EARNING', calcType: 'FIXED', value: 15000 },
        { name: 'Conveyance', type: 'EARNING', calcType: 'PERCENT_BASIC', value: 10 },
      ],
    });
    expect(line.grossPay).toBe(130000); // 100000 + 5000 + 15000 + 10000
    expect(line.netPay).toBe(130000);
    const byName = Object.fromEntries(line.componentBreakdown.map((b) => [b.name, b.amount]));
    expect(byName['House Rent']).toBe(15000);
    expect(byName['Conveyance']).toBe(10000);
  });

  it('allows a per-employee override of the default component amount', () => {
    const line = computePayrollLine({
      basicSalary: 100000,
      allowance: 0,
      attendance: [],
      daysInMonth: 30,
      components: [{ name: 'House Rent', type: 'EARNING', calcType: 'FIXED', value: 15000, amount: 20000 }],
    });
    expect(line.grossPay).toBe(120000);
    expect(line.netPay).toBe(120000);
  });

  it('deducts FIXED/PERCENT deduction components and loan installments', () => {
    const line = computePayrollLine({
      basicSalary: 100000,
      allowance: 0,
      attendance: [],
      daysInMonth: 30,
      components: [
        { name: 'Income Tax', type: 'DEDUCTION', calcType: 'PERCENT_BASIC', value: 4 },
        { name: 'Health Insurance', type: 'DEDUCTION', calcType: 'FIXED', value: 2000 },
      ],
      loanInstallments: [10000],
    });
    expect(line.totalDeduction).toBe(16000); // 4000 + 2000 + 10000
    expect(line.netPay).toBe(84000);
    const byName = Object.fromEntries(line.componentBreakdown.map((b) => [b.name, b.amount]));
    expect(byName['Income Tax']).toBe(4000);
    expect(byName['Loan/Advance']).toBe(10000);
  });

  it('includes component breakdown with basic/allowance/overtime/absents', () => {
    const line = computePayrollLine({
      basicSalary: 30000,
      allowance: 3000,
      attendance: [{ status: 'absent', overtimeHours: 0 }],
      daysInMonth: 30,
      components: [{ name: 'House Rent', type: 'EARNING', calcType: 'FIXED', value: 2000 }],
    });
    const byName = Object.fromEntries(line.componentBreakdown.map((b) => [b.name, b.amount]));
    expect(byName['Basic']).toBe(30000);
    expect(byName['Allowance']).toBe(3000);
    expect(byName['House Rent']).toBe(2000);
    expect(byName['Absent Deduction']).toBe(1000);
  });

  it('ignores loan installments when the deduction sum would overflow', () => {
    const line = computePayrollLine({
      basicSalary: 10000,
      allowance: 0,
      attendance: [],
      daysInMonth: 30,
      loanInstallments: [0],
    });
    expect(line.totalDeduction).toBe(0);
    expect(line.netPay).toBe(10000);
  });
});