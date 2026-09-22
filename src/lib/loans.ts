import type { LoanPlan } from '../types';
import { clamp } from './energy';

export function loanSchedule(l: LoanPlan, principalMan: number) {
  const months = Math.round(clamp(l.years, 1, 60)) * 12;
  const rates = (l.loanType === 'fix' ? [l.fixRate1, l.fixRate2, l.fixRate3] : [l.varRate1, l.varRate2, l.varRate3]).map(r => clamp(r, 0, 100));
  const ends = l.loanType === 'fix' ? [l.fixPeriod1, l.fixPeriod2] : [l.varPeriod1, l.varPeriod2];
  const firstEnd = Math.round(clamp(ends[0], 0, l.years)) * 12;
  const secondEnd = Math.max(firstEnd, Math.round(clamp(ends[1], 0, l.years)) * 12);
  const bonusMonths = l.bonusTimes === 3 ? [3, 7, 11] : l.bonusTimes === 2 ? [5, 11] : l.bonusTimes === 1 ? [11] : [];
  const annual = Array.from({ length: 60 }, () => ({ paid: 0, prepaid: 0, balance: 0, deductionEligible: false }));
  const phaseMonthly = [0, 0, 0];
  const prepay = new Map<number, number>();
  for (const [year, amount] of [[l.pyear, l.pamount], [l.pyear2, l.pamount2]]) {
    if (amount > 0) {
      const month = Math.max(1, Math.round(year)) * 12;
      prepay.set(month, (prepay.get(month) ?? 0) + amount * 1e4);
    }
  }
  let balance = clamp(principalMan) * 1e4;
  let targetEnd = months, regular = 0, previousPhase = -1, completionMonth = 0;
  let totalPaid = 0, totalInterest = 0;
  const payment = (bal: number, rate: number, start: number) => {
    const mr = rate / 1200;
    let annuityPV = 0, bonusPV = 0;
    for (let m = start; m < targetEnd; m++) {
      const discount = (1 + mr) ** -(m - start + 1);
      annuityPV += discount;
      if (bonusMonths.includes(m % 12)) bonusPV += l.bonusAmount * 1e4 * discount;
    }
    return annuityPV > 0 ? Math.max(0, (bal - bonusPV) / annuityPV) : bal;
  };
  for (let m = 0; m < months && balance > 0.000001; m++) {
    const phase = m < firstEnd ? 0 : m < secondEnd ? 1 : 2;
    const mr = rates[phase] / 1200;
    if (phase !== previousPhase) {
      regular = payment(balance, rates[phase], m);
      phaseMonthly[phase] = regular / 1e4;
      previousPhase = phase;
    }
    const interest = balance * mr;
    balance += interest;
    let paid = Math.min(balance, regular);
    balance -= paid;
    if (bonusMonths.includes(m % 12)) {
      const bonus = Math.min(balance, l.bonusAmount * 1e4);
      balance -= bonus;
      paid += bonus;
    }
    const prepaid = Math.min(balance, prepay.get(m + 1) ?? 0);
    balance -= prepaid;
    if (prepaid > 0 && balance > 0.000001) {
      if (l.ptype === '返済額軽減') regular = payment(balance, rates[phase], m + 1);
      else {
        // 繰上返済で短くなった残期間を、次の金利変更時にも引き継ぐ。
        let remaining = balance;
        for (let k = m + 1; k < targetEnd; k++) {
          remaining = remaining * (1 + mr) - regular - (bonusMonths.includes(k % 12) ? l.bonusAmount * 1e4 : 0);
          if (remaining <= 0.000001) { targetEnd = k + 1; break; }
        }
      }
    }
    const row = annual[Math.floor(m / 12)];
    row.paid += paid / 1e4;
    row.prepaid += prepaid / 1e4;
    row.balance = Math.max(0, balance / 1e4);
    row.deductionEligible = targetEnd >= 120;
    totalPaid += (paid + prepaid) / 1e4;
    totalInterest += interest / 1e4;
    completionMonth = m + 1;
  }
  return { annual, phaseMonthly, completionMonth, totalPaid, totalInterest };
}
