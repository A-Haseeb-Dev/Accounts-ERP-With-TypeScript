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
});