import { DEFAULT_DATA } from './defaults';
import type { SimData } from '../types';
import { clamp } from './math';
import { expenseCategory } from './suddenExpenses';
import { legacyAssessment, BUILDING_ASSESSMENT_RATIO, LAND_ASSESSMENT_RATIO,
  BUILD_EVAL_PER_TSUBO_FALLBACK, LAND_EVAL_PER_TSUBO_FALLBACK } from './propertyAssessment';

export function mergeWithDefaults<T>(defaults: T, override: unknown): T {
  if (override === undefined) return structuredClone(defaults);
  if (defaults === null) {
    if (override === null || typeof override === 'number' && Number.isFinite(override) && override >= 0) return override as T;
    return defaults;
  }
  if (Array.isArray(defaults)) return (Array.isArray(override) ? structuredClone(override) : structuredClone(defaults)) as T;
  if (typeof defaults === 'number') return (typeof override === 'number' && Number.isFinite(override) && override >= 0 ? override : defaults) as T;
  if (typeof defaults === 'string' || typeof defaults === 'boolean') return (typeof override === typeof defaults ? override : defaults) as T;
  if (!override || typeof override !== 'object') return structuredClone(defaults);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaults as object)) out[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], (override as Record<string, unknown>)[key]);
  return out as T;
}

export function normalizeData(raw: unknown): SimData {
  const d = mergeWithDefaults(DEFAULT_DATA, raw);
  const oldHousing = raw && typeof raw === 'object' ? (raw as Partial<SimData>).housing : undefined;
  // Anchor older price-based estimates to their saved areas without changing the loaded tax.
  if (oldHousing && typeof oldHousing === 'object') {
    const h = d.housing;
    if (oldHousing.propTaxBuildingUnitValue === undefined) {
      const value = legacyAssessment(h.building, BUILDING_ASSESSMENT_RATIO, h.buildArea, BUILD_EVAL_PER_TSUBO_FALLBACK);
      if (h.buildArea > 0) h.propTaxBuildingUnitValue = value / h.buildArea;
      else if (h.propTaxBuildingValue === null) h.propTaxBuildingValue = value;
    }
    if (oldHousing.propTaxLandUnitValue === undefined) {
      const value = legacyAssessment(h.land, LAND_ASSESSMENT_RATIO, h.landArea, LAND_EVAL_PER_TSUBO_FALLBACK);
      if (h.landArea > 0) h.propTaxLandUnitValue = value / h.landArea;
      else if (h.propTaxLandValue === null) h.propTaxLandValue = value;
    }
  }
  const old = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const oldLoan = old.loan && typeof old.loan === 'object' ? old.loan as Record<string, unknown> : {};
  if (oldLoan.taxEstimateMode === undefined && oldLoan.taxInclude === true) d.loan.taxEstimateMode = 'manual';
  const oldHousehold = old.household && typeof old.household === 'object' ? old.household as Record<string, unknown> : {};
  if (oldHousehold.utilityInputVersion !== 1 && old.solar && typeof old.solar === 'object') {
    const s = old.solar as Record<string, unknown>;
    const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const number = (key: string, fallback: number) => valid(s[key]) ? s[key] as number : fallback;
    // Resolve the old pre-discount bill once. In the new model zero is an explicit bill, not an auto-calculation flag.
    const ratio = clamp(number('dayUsageRatio', 40), 0, 100) / 100;
    const autoBill = number('baseChargeMonthly', 0) + number('monthlyUsage', 400)
      * (ratio * number('elecPriceDay', 30) + (1 - ratio) * number('elecPriceNight', 26)) / 1e4;
    d.household.electricMonthly = valid(oldHousehold.electricMonthly) && oldHousehold.electricMonthly > 0
      ? oldHousehold.electricMonthly : valid(s.elecBillManual) ? s.elecBillManual : autoBill;
  }
  d.household.utilityInputVersion = 1;
  const templateExpense = { id: '', name: '', amount: 0, cycleYears: 1, firstYear: 1, endYear: 60, once: false };
  d.suddenExpenses = d.suddenExpenses.filter(v => v && typeof v === 'object').map((e, i) => {
    const clean = mergeWithDefaults(templateExpense, e);
    return { ...clean, id: clean.id || 'expense-' + i, category: expenseCategory({ name: clean.name, category: e.category }),
      firstYear: Math.max(1, Math.round(e.firstYear === undefined ? clean.cycleYears : clean.firstYear)) };
  });
  d.savingsInsurances = d.savingsInsurances.filter(v => v && typeof v === 'object').map((si, i) => {
    const clean = mergeWithDefaults({ id: '', name: '', monthly: 0, payoutYear: 1, payoutAmount: 0 }, si);
    return { ...clean, id: clean.id || 'insurance-' + i, payoutYear: Math.max(1, Math.round(clean.payoutYear)) };
  });
  d.maint.items = d.maint.items.filter(v => v && typeof v === 'object').map((it, i) => {
    const clean = mergeWithDefaults({ id: '', name: '', cycleYears: 0, cost: 0, enabled: false }, it);
    return { ...clean, id: clean.id || 'maintenance-' + i, cycleYears: Math.round(clean.cycleYears) };
  });
  const validNumbers = (values: number[], length: number, fallback: number[]) => values.length === length && values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? values : [...fallback];
  d.basic.salaryManual = validNumbers(d.basic.salaryManual, 8, DEFAULT_DATA.basic.salaryManual);
  d.basic.spouseSalaryManual = validNumbers(d.basic.spouseSalaryManual, 8, DEFAULT_DATA.basic.spouseSalaryManual);
  if (![30, 40, 50, 60].includes(d.simYears)) d.simYears = 30;
  if (!['var', 'fix'].includes(d.loan.loanType)) d.loan.loanType = 'var';
  if (!['期間短縮', '返済額軽減'].includes(d.loan.ptype)) d.loan.ptype = '期間短縮';
  if (!['long_term', 'zeh', 'general'].includes(d.loan.taxHouseType)) d.loan.taxHouseType = 'long_term';
  if (!['income', 'manual'].includes(d.loan.taxEstimateMode)) d.loan.taxEstimateMode = 'income';
  d.basic.kids = Math.min(3, Math.floor(d.basic.kids));
  return d;
}
