import type { SuddenExpense } from '../types';

export function getSuddenExpenseOccurrenceYears(simYears: number, cycleYears: number): number[] {
  if (simYears <= 0 || cycleYears <= 0) return [];

  const years: number[] = [];
  for (let year = cycleYears; year < simYears; year += cycleYears) {
    years.push(year);
  }
  return years;
}

export function countSuddenExpenseOccurrences(simYears: number, cycleYears: number): number {
  return getSuddenExpenseOccurrenceYears(simYears, cycleYears).length;
}

export function calcSuddenExpenseTotal(simYears: number, expense: SuddenExpense): number {
  return countSuddenExpenseOccurrences(simYears, expense.cycleYears) * expense.amount;
}
