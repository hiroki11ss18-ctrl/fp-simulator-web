import type { CalcResult, SimData, YearRow } from '../types';
import { clamp } from './math';

export const HORIZONS = [30, 40, 50, 60] as const;

export function buildExpenseTotals(data: SimData, calc: CalcResult) {
  const rows = calc.rows.slice(0, data.simYears);
  const sum = (value: (row: YearRow) => number) => rows.reduce((total, row) => total + value(row), 0);
  const items = [
    { key: 'loan', label: '住宅ローン返済', detail: '元金・利息・賞与返済・繰上返済', amount: sum(r => r.loanPay) },
    { key: 'living', label: '生活費・掛捨保険', detail: '食費・日用品・趣味・医療など（車関連を除く）', amount: sum(r => r.living - r.carRunningCost - r.otherLoanPay - r.insurancePremium) },
    { key: 'utility', label: '光熱費', detail: '電気・ガス／灯油・水道', amount: sum(r => r.utility) },
    { key: 'travel', label: '旅行費', detail: '予定支出で「旅行」に分類した費用', amount: sum(r => r.plannedCosts.travel) },
    { key: 'car', label: '車の費用', detail: '維持費・自動車保険・買い替えなどの車の予定支出', amount: sum(r => r.carRunningCost + r.plannedCosts.car) },
    { key: 'education', label: '教育費・学費', detail: '学校の費用・学習費・下宿の仕送り', amount: sum(r => r.eduCost) },
    { key: 'tax', label: '固定資産税等', detail: '固定資産税・対象区域の都市計画税', amount: sum(r => r.propTax) },
    { key: 'maintenance', label: '住まいの修繕費', detail: '建物のメンテナンス・設備更新', amount: sum(r => r.maintCost) },
    { key: 'insurance', label: '貯蓄型・学資保険料', detail: '払込額の合計（満期受取は収入に計上）', amount: sum(r => r.insurancePremium) },
    { key: 'otherLoan', label: '住宅以外のローン返済', detail: '入力済みの他ローン返済（車のローン等も含む）', amount: sum(r => r.otherLoanPay) },
    { key: 'other', label: 'その他の予定支出', detail: '旅行・車以外の一時支出・定期支出', amount: sum(r => r.plannedCosts.other) },
  ];
  const periodTotal = sum(r => r.totalOut);
  return { years: data.simYears, items, periodTotal, purchaseCash: calc.cashRequired, grandTotal: calc.cashRequired + periodTotal };
}

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
  const exclude = new Set(['otherLoan', 'otherLoanBalance', 'otherLoanRate', 'otherLoanMonths', 'inflationRate', 'utilityInputVersion']);
  for (const key of Object.keys(d.household) as (keyof typeof d.household)[])
    if (!exclude.has(key)) d.household[key] *= expenseFactor;
  d.maint.items.forEach(i => { i.cost *= expenseFactor; });
  d.suddenExpenses.forEach(e => { e.amount *= expenseFactor; });
  for (const key of Object.keys(d.educationCosts)) d.educationCosts[key] *= expenseFactor;
  d.basic.aloneMonthly *= expenseFactor;
  return d;
}

export function buildLifeStageExpenses(data: SimData, calc: CalcResult) {
  const categories = [
    { label: '住宅ローン・繰上返済', value: (r: YearRow) => r.loanPay },
    { label: '生活費・掛捨保険', value: (r: YearRow) => r.living - r.insurancePremium - r.otherLoanPay },
    { label: '住宅以外のローン', value: (r: YearRow) => r.otherLoanPay },
    { label: '貯蓄型・学資保険の払込', value: (r: YearRow) => r.insurancePremium },
    { label: '光熱費（電気・ガス・水道）', value: (r: YearRow) => r.utility },
    { label: '固定資産税等', value: (r: YearRow) => r.propTax },
    { label: '教育・仕送り', value: (r: YearRow) => r.eduCost },
    { label: '修繕・設備更新', value: (r: YearRow) => r.maintCost },
    { label: '旅行・車等の予定支出', value: (r: YearRow) => r.sudden },
  ];
  const summarize = (rows: YearRow[]) => {
    if (!rows.length) return null;
    const months = rows.length * 12;
    const total = rows.reduce((sum, r) => sum + r.totalOut, 0);
    return { startAge: rows[0].age - 1, endAge: rows[rows.length - 1].age - 1,
      firstYear: rows[0].year, lastYear: rows[rows.length - 1].year, years: rows.length,
      amounts: categories.map(item => rows.reduce((sum, r) => sum + item.value(r), 0) / months),
      monthlyTotal: total / months, total };
  };
  // Match the ledger's year-start retirement boundary, including years beyond the selected horizon.
  const isWorking = (r: YearRow) => r.age - 1 < data.basic.retireAge;
  return { labels: categories.map(item => item.label),
    working: summarize(calc.rows.filter(isWorking)),
    retired: summarize(calc.rows.filter(r => !isWorking(r))), years: calc.rows.length };
}

export function buildOverview(data: SimData, calc: CalcResult) {
  const first = calc.rows[0];
  const chosen = calc.rows.slice(0, data.simYears);
  const reserve = chosen.reduce((sum, r) => sum + r.maintCost + r.sudden, 0) / data.simYears / 12;
  const regularIncome = (first.wage + first.pension) / 12;
  const monthlyItems = [
    { label: '住宅ローン（賞与返済を月割）', amount: (first.loanPay - first.prepaid) / 12 },
    { label: '生活費・保険・他ローン', amount: first.living / 12 },
    { label: '光熱費（電気・ガス・水道）', amount: first.utility / 12 },
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
    return { years, age: final.age, balance: final.balance, debt: final.loanBalance + final.otherLoanBalance,
      low, deficit };
  });
  const selected = horizonRows.find(r => r.years === data.simYears)!;
  return { monthlyItems, regularIncome, monthlyOut, monthlySurplus, reserve, emergencyFund, horizonRows, selected,
    lifeStages: buildLifeStageExpenses(data, calc) };
}
