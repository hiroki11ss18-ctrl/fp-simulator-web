import { clamp } from './math';

// Amounts are in man-yen. Salary deductions use the published quick formula,
// not the detailed payroll table. Sources and exclusions are recorded in the FP specification.
export function salaryIncome(gross: number, year: number): number {
  const deduction = gross <= 360 ? Math.max(year <= 2027 ? 74 : 69, gross * 0.3 + 8)
    : gross <= 660 ? gross * 0.2 + 44 : gross <= 850 ? gross * 0.1 + 110 : 195;
  return Math.max(0, gross - deduction);
}

export function basicTaxDeduction(income: number, year: number): number {
  if (income > 2500) return 0;
  if (income > 2450) return 16;
  if (income > 2400) return 32;
  if (income > 2350) return 48;
  if (year <= 2027) return income <= 489 ? 104 : income <= 655 ? 67 : 62;
  return income <= 132 ? 99 : 62;
}

export function estimatedTaxCapacity(gross: number, year: number, socialInsurancePct: number, otherDeductions: number) {
  const income = salaryIncome(Math.max(0, gross), year);
  const taxable = Math.floor(Math.max(0, income - basicTaxDeduction(income, year)
    - gross * clamp(socialInsurancePct, 0, 100) / 100 - Math.max(0, otherDeductions)) * 10 + 1e-8) / 10;
  const incomeTax = taxable <= 195 ? taxable * 0.05 : taxable <= 330 ? taxable * 0.1 - 9.75
    : taxable <= 695 ? taxable * 0.2 - 42.75 : taxable <= 900 ? taxable * 0.23 - 63.6
      : taxable <= 1800 ? taxable * 0.33 - 153.6 : taxable <= 4000 ? taxable * 0.4 - 279.6 : taxable * 0.45 - 479.6;
  const residentLimit = incomeTax > 0 ? Math.min(taxable * 0.05, 9.75) : 0;
  return { income, taxable, incomeTax, residentLimit, total: incomeTax + residentLimit };
}

export function estimatePersonalRelief(loanLimit: number, gross: number, year: number,
  socialInsurancePct: number, otherDeductions: number, manualCap: number | null) {
  const tax = estimatedTaxCapacity(gross, year, socialInsurancePct, otherDeductions);
  // Manual caps may include pension income checked separately; automatic estimates use salary only.
  if (tax.income > 2000) return 0;
  const capacity = manualCap === null ? tax.total : Math.max(0, manualCap);
  return Math.floor(Math.max(0, Math.min(loanLimit, capacity)) * 100 + 1e-8) / 100;
}
