import type { SuddenExpense } from '../types';

export function getSuddenExpenseOccurrenceYears(simYears: number, cycleYears: number): number[] {
  if (simYears <= 0 || cycleYears <= 0) return [];

  const years: number[] = [];
  for (let year = cycleYears; year <= simYears; year += cycleYears) {
    years.push(year);
  }
  return years;
}

export function countSuddenExpenseOccurrences(simYears: number, cycleYears: number): number {
  return getSuddenExpenseOccurrenceYears(simYears, cycleYears).length;
}

export function calcSuddenExpenseTotal(simYears: number, expense: SuddenExpense): number {
  return Array.from({ length: simYears }, (_, i) => occursInYear(expense, i + 1) ? expense.amount : 0).reduce((a, b) => a + b, 0);
}

export function occursInYear(e: SuddenExpense, year: number) {
  const first = Math.max(1, Math.round(e.firstYear ?? e.cycleYears));
  const end = e.endYear && e.endYear > 0 ? e.endYear : 60;
  if (year < first || year > end) return false;
  return e.once ? year === first : e.cycleYears > 0 && (year - first) % Math.max(1, Math.round(e.cycleYears)) === 0;
}
