import type { CalcResult, SimData, YearRow } from '../types';

export interface BalancePoint {
  year: number;
  age: number;
  balance: number;
  row: YearRow | null;
}

export function buildBalanceTimeline(data: SimData, calc: CalcResult) {
  const points: BalancePoint[] = [
    { year: 0, age: data.basic.age, balance: calc.initialCash, row: null },
    ...calc.rows.map(row => ({ year: row.year, age: row.age, balance: row.balance, row })),
  ];
  const first = points[0], last = points[points.length - 1];
  // Retirement is at the preceding working year's end, after its retirement payment.
  const retirementYear = data.basic.retireAge - data.basic.age;
  const retirement = retirementYear > 0 ? points.find(p => p.year === retirementYear) ?? null : null;
  const payoff = calc.loan > 0 ? points.find(p => p.row && p.row.loanBalance <= 0.000001) ?? null : null;
  const milestones = [
    { key: 'purchase', label: '購入直後', point: first, note: '' },
    { key: 'retirement', label: '世帯主の退職時', point: retirement,
      note: retirementYear <= 0 ? '退職済み' : `${data.basic.retireAge}歳・表示期間外` },
    { key: 'payoff', label: '住宅ローン完済年末', point: payoff,
      note: calc.loan <= 0 ? '借入なし' : '表示期間内の完済なし' },
    { key: 'final', label: `${last.year}年後`, point: last, note: '' },
  ];
  return { points, first, last, milestones, retirementYear };
}

export function balanceAxis(values: number[]) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const rawStep = Math.max(100, high - low) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 5, 10].find(n => n * power >= rawStep) ?? 10) * power;
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  return { min, max, ticks };
}
