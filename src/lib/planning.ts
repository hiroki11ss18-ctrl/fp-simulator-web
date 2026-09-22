import type { CalcResult, SimData } from '../types';
import { calcAll } from '../hooks/useCalculations';
import { clamp } from './energy';

export const REVIEW_LABELS = {
  income: '給与明細・昇給・退職金・年金を確認',
  expenses: '生活費・旅行・車・保険・物価を確認',
  housing: '見積・借入・税・修繕費を確認',
  education: '進路・保育料・入学費・仕送りを確認',
  energy: '電気明細・設備見積・売電契約を確認',
} as const;
export const HORIZONS = [30, 40, 50, 60] as const;

export function makeStressData(data: SimData): SimData {
  const d = structuredClone(data);
  const wageFactor = 1 - clamp(d.stress.incomeDropPct, 0, 100) / 100;
  d.basic.income *= wageFactor; d.basic.annualBonusInc *= wageFactor;
  d.basic.spouseIncome *= wageFactor; d.basic.spouseAnnualBonusInc *= wageFactor;
  d.basic.salaryManual = d.basic.salaryManual.map(v => v * wageFactor);
  d.basic.spouseSalaryManual = d.basic.spouseSalaryManual.map(v => v * wageFactor);
  // 固定金利の契約後の上昇ではなく「借入前の金利条件の比較」。
  for (const key of ['varRate1', 'varRate2', 'varRate3', 'fixRate1', 'fixRate2', 'fixRate3'] as const)
    d.loan[key] = clamp(d.loan[key] + d.stress.rateAdd, 0, 100);
  const expenseFactor = 1 + clamp(d.stress.expenseAddPct, 0, 100) / 100;
  const exclude = new Set(['otherLoan', 'otherLoanBalance', 'otherLoanRate', 'otherLoanMonths', 'inflationRate', 'electricMonthly']);
  for (const key of Object.keys(d.household) as (keyof typeof d.household)[])
    if (!exclude.has(key)) d.household[key] *= expenseFactor;
  d.solar.elecPriceDay *= expenseFactor; d.solar.elecPriceNight *= expenseFactor;
  d.solar.baseChargeMonthly *= expenseFactor;
  if (d.solar.elecBillManual !== null) d.solar.elecBillManual *= expenseFactor;
  d.household.electricMonthly *= expenseFactor;
  d.maint.items.forEach(i => { i.cost *= expenseFactor; });
  for (const key of ['powerconCost', 'battReplaceCost', 'solarMaintCost', 'panelReplaceCost'] as const) d.solar[key] *= expenseFactor;
  d.suddenExpenses.forEach(e => { e.amount *= expenseFactor; });
  for (const key of Object.keys(d.educationCosts)) d.educationCosts[key] *= expenseFactor;
  d.basic.aloneMonthly *= expenseFactor;
  return d;
}

export function buildOverview(data: SimData, calc: CalcResult) {
  const stress = calcAll(makeStressData(data));
  const first = calc.rows[0];
  const chosen = calc.rows.slice(0, data.simYears);
  const reserve = chosen.reduce((sum, r) => sum + r.maintCost + r.sudden, 0) / data.simYears / 12;
  const regularIncome = (first.wage + first.pension + first.solarSale) / 12;
  const monthlyItems = [
    { label: '住宅ローン（賞与返済を月割）', amount: (first.loanPay - first.prepaid) / 12 },
    { label: '生活費・保険・他ローン', amount: first.living / 12 },
    { label: '光熱費（節電後）', amount: first.utility / 12 },
    { label: '教育・仕送り', amount: first.eduCost / 12 },
    { label: '固定資産税等の積立', amount: first.propTax / 12 },
    { label: '修繕・旅行・車などの積立', amount: reserve },
  ];
  const monthlyOut = monthlyItems.reduce((sum, i) => sum + i.amount, 0);
  const monthlySurplus = regularIncome - monthlyOut;
  const emergencyFund = monthlyOut * data.basic.emergencyFundMonths;
  const horizonRows = HORIZONS.map(years => {
    const rows = calc.rows.slice(0, years);
    const final = rows[years - 1];
    const low = rows.reduce((a, r) => r.balance < a.balance ? { year: r.year, age: r.age, balance: r.balance } : a,
      { year: 0, age: data.basic.age, balance: calc.initialCash });
    const deficit = calc.initialCash < 0 ? 0 : rows.find(r => r.balance < 0)?.year ?? null;
    const stressLow = Math.min(stress.initialCash, ...stress.rows.slice(0, years).map(r => r.balance));
    return { years, age: final.age, balance: final.balance, debt: final.loanBalance + final.otherLoanBalance,
      low, deficit, stressBalance: stress.rows[years - 1].balance, stressLow };
  });
  const selected = horizonRows.find(r => r.years === data.simYears)!;
  const allConfirmed = Object.values(data.reviewChecks).every(Boolean);
  return { stress, monthlyItems, regularIncome, monthlyOut, monthlySurplus, reserve, emergencyFund, horizonRows, selected, allConfirmed };
}
