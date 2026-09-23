import { DEFAULT_DATA } from './defaults';
import type { SimData } from '../types';
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
  const legacySolar = raw && typeof raw === 'object' ? (raw as Partial<SimData>).solar : undefined;
  if (legacySolar && legacySolar.fitStepYears === undefined) d.solar.fitStepYears = d.solar.fitYears;
  const templateExpense = { id: '', name: '', amount: 0, cycleYears: 1, firstYear: 1, endYear: 60, once: false };
  d.suddenExpenses = d.suddenExpenses.filter(v => v && typeof v === 'object').map((e, i) => {
    const clean = mergeWithDefaults(templateExpense, e);
    return { ...clean, id: clean.id || 'expense-' + i,
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
  d.solar.genM = validNumbers(d.solar.genM, 12, []);
  if (![30, 40, 50, 60].includes(d.simYears)) d.simYears = 30;
  if (!['included', 'cash', 'loan'].includes(d.solar.funding)) d.solar.funding = 'included';
  if (!['var', 'fix'].includes(d.loan.loanType)) d.loan.loanType = 'var';
  if (!['期間短縮', '返済額軽減'].includes(d.loan.ptype)) d.loan.ptype = '期間短縮';
  if (!['long_term', 'zeh', 'general'].includes(d.loan.taxHouseType)) d.loan.taxHouseType = 'long_term';
  d.basic.kids = Math.min(3, Math.floor(d.basic.kids));
  return d;
}
