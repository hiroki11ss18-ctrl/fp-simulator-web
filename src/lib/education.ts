import type { BasicInfo } from '../types';
import { DEFAULT_DATA } from './defaults';

export const EDUCATION_SOURCE = 'https://www.mext.go.jp/content/20260327-mxt_chousa01-000048552_11.pdf#page=4';
export const STUDY_YEARS: Record<string, number> = {
  '国公立大学': 4, '私立文系': 4, '私立理系': 4, '専門学校(2年)': 2, '専門学校(3年)': 3, '就職': 0,
};
export function childrenOf(b: BasicInfo) {
  return [
    { age: b.c1age, mid: b.c1mid, high: b.c1high, uni: b.c1uni, alone: b.c1alone },
    { age: b.c2age, mid: b.c2mid, high: b.c2high, uni: b.c2uni, alone: b.c2alone },
    { age: b.c3age, mid: b.c3mid, high: b.c3high, uni: b.c3uni, alone: b.c3alone },
  ].slice(0, Math.min(3, Math.max(0, b.kids)));
}
export function eduAnnualByAge(age: number, mid: string, high: string, uni: string, costs = DEFAULT_DATA.educationCosts) {
  const key = age >= 3 && age < 6 ? '未就学' : age >= 6 && age < 12 ? '公立小学校'
    : age >= 12 && age < 15 ? mid : age >= 15 && age < 18 ? high
      : age >= 18 && age < 18 + (STUDY_YEARS[uni] ?? 0) ? uni : '';
  return costs[key] ?? 0;
}
export function childEducation(k: ReturnType<typeof childrenOf>[number], y: number, b: BasicInfo, costs: Record<string, number>) {
  const age = k.age + y;
  const support = age >= 18 && age < 18 + Math.min(k.alone, STUDY_YEARS[k.uni] ?? 0) ? b.aloneMonthly * 12 : 0;
  return eduAnnualByAge(age, k.mid, k.high, k.uni, costs) + support;
}
export function calcEdu(mid: string, high: string, uni: string, alone: number, aloneMonthly: number) {
  let total = 0;
  for (let age = 3; age < 25; age++) total += eduAnnualByAge(age, mid, high, uni);
  return { total: total + Math.min(alone, STUDY_YEARS[uni] ?? 0) * aloneMonthly * 12 };
}
