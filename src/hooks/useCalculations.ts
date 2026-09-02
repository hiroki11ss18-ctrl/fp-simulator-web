import { useMemo } from 'react';
import type { SimData, CalcResult, YearRow, LoanPlan, HouseType } from '../types';
import { MFACTORS } from '../lib/defaults';

// ─── 月返済額（元利均等）───
export function calcMonthly(principal: number, rate: number, years: number): number {
  const mr = rate / 100 / 12;
  const n = years * 12;
  if (n <= 0) return 0;
  if (mr <= 0) return principal / n;
  return principal * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1);
}

// 指定月数後の残高
export function getBalance(principal: number, rate: number, years: number, months: number): number {
  const mr = rate / 100 / 12;
  if (mr <= 0) return principal * (1 - months / (years * 12));
  const mo = calcMonthly(principal, rate, years);
  return Math.max(0, principal * Math.pow(1 + mr, months) - mo * (Math.pow(1 + mr, months) - 1) / mr);
}

// ─── 住宅ローン減税 ───
// 令和8・9年入居の新築住宅を基準にした借入限度額。
// 子育て・若者夫婦世帯は性能区分ごとに上乗せがある。
export function getTaxBorrowLimit(houseType: HouseType, moveInYear = 2026, specialHousehold = false): number {
  const currentRule = moveInYear <= 2027;
  if (houseType === 'long_term') return currentRule ? (specialHousehold ? 5000 : 4500) : (specialHousehold ? 4500 : 3500);
  if (houseType === 'zeh') return specialHousehold ? 4500 : 3500;
  return currentRule ? (specialHousehold ? 3000 : 2000) : 0;
}
export function getTaxYears(houseType: HouseType, moveInYear: number): number {
  if (houseType === 'general' && moveInYear >= 2028) return 0;
  return 13;
}
export function calcTaxDeduction(loanMan: number, rate: number, years: number, houseType: HouseType, moveInYear: number, specialHousehold = false) {
  const limit = getTaxBorrowLimit(houseType, moveInYear, specialHousehold);
  const deductYears = getTaxYears(houseType, moveInYear);
  if (limit <= 0 || deductYears <= 0 || years <= 0 || loanMan <= 0) {
    return { total: 0, deductYears: 0, data: [], borrowLimit: limit, monthlyAvg: 0 };
  }
  const P = loanMan * 1e4;
  let bal = P;
  const mr = rate / 100 / 12;
  const mo = mr > 0 ? P * mr * Math.pow(1 + mr, years * 12) / (Math.pow(1 + mr, years * 12) - 1) : P / (years * 12);
  let total = 0;
  const data: { year: number; balance: number; annual: number; cumul: number }[] = [];
  for (let y = 1; y <= deductYears && y <= years; y++) {
    for (let m = 0; m < 12; m++) bal = Math.max(0, bal * (1 + mr) - mo);
    const deduct = Math.round(Math.min(bal * 0.007, limit * 1e4 * 0.007) / 1e4 * 10) / 10;
    total += deduct;
    data.push({ year: y, balance: Math.round(bal / 1e4), annual: deduct, cumul: Math.round(total * 10) / 10 });
  }
  return { total: Math.round(total * 10) / 10, deductYears, data, borrowLimit: limit, monthlyAvg: Math.round(total / (deductYears * 12) * 10) / 10 };
}

// ─── 固定資産税（出雲市概算）───
//   出雲市: 固定資産税 1.5% / 都市計画税 0.075%
//   建物: 新築軽減は固定資産税部分のみ1/2、120㎡相当分まで
//   土地: 200㎡まで小規模住宅用地、200㎡超は一般住宅用地として按分
// 評価額の自動算出:
//   建物 = 建物本体価格 × 45%（家屋評価の概算。価格未入力時は建坪×38万円）
//   土地 = 土地代 × 70%（価格未入力時は土地坪×11万円）
export const IZUMO_PROPERTY_TAX_RATE = 0.015;
export const IZUMO_CITY_PLANNING_TAX_RATE = 0.00075;
export const BUILDING_ASSESSMENT_RATIO = 0.45;
export const LAND_ASSESSMENT_RATIO = 0.70;
export const BUILD_EVAL_PER_TSUBO_FALLBACK = 38; // 万円/坪
export const LAND_EVAL_PER_TSUBO_FALLBACK = 11;  // 万円/坪
export const TSUBO_TO_M2 = 3.305785;
export const NEW_HOME_REDUCTION_CAP_M2 = 120;
export const SMALL_RESIDENTIAL_LAND_CAP_M2 = 200;
export function calcPropertyTax(housing: SimData['housing'], loan: SimData['loan']) {
  const buildArea = housing.buildArea ?? 0;
  const landArea = housing.landArea ?? 0;
  const buildAreaM2 = buildArea * TSUBO_TO_M2;
  const landAreaM2 = landArea * TSUBO_TO_M2;
  const buildAuto = housing.building > 0
    ? Math.round(housing.building * BUILDING_ASSESSMENT_RATIO)
    : Math.round(buildArea * BUILD_EVAL_PER_TSUBO_FALLBACK);
  const landAuto = housing.land > 0
    ? Math.round(housing.land * LAND_ASSESSMENT_RATIO)
    : Math.round(landArea * LAND_EVAL_PER_TSUBO_FALLBACK);
  const buildVal = housing.propTaxBuildingValue !== null ? housing.propTaxBuildingValue : buildAuto;
  const landVal  = housing.propTaxLandValue  !== null ? housing.propTaxLandValue  : landAuto;
  const reductionYears = loan.isLongTermHouse ? 5 : 3;
  const cityPlanningRate = housing.cityPlanningTaxEnabled ? IZUMO_CITY_PLANNING_TAX_RATE : 0;

  const reductionRatio = buildAreaM2 > 0 ? Math.min(1, NEW_HOME_REDUCTION_CAP_M2 / buildAreaM2) : 1;
  const reducedBuildVal = buildVal * reductionRatio;
  const normalBuildVal = Math.max(0, buildVal - reducedBuildVal);

  const buildDuring =
    reducedBuildVal * (IZUMO_PROPERTY_TAX_RATE * 0.5 + cityPlanningRate)
    + normalBuildVal * (IZUMO_PROPERTY_TAX_RATE + cityPlanningRate);
  const buildAfter = buildVal * (IZUMO_PROPERTY_TAX_RATE + cityPlanningRate);

  const smallLandM2 = landAreaM2 > 0 ? Math.min(landAreaM2, SMALL_RESIDENTIAL_LAND_CAP_M2) : 0;
  const generalLandM2 = landAreaM2 > 0 ? Math.max(0, landAreaM2 - SMALL_RESIDENTIAL_LAND_CAP_M2) : 0;
  const smallLandVal = landAreaM2 > 0 ? landVal * (smallLandM2 / landAreaM2) : landVal;
  const generalLandVal = landAreaM2 > 0 ? Math.max(0, landVal - smallLandVal) : 0;
  const landFixed = smallLandVal * IZUMO_PROPERTY_TAX_RATE / 6 + generalLandVal * IZUMO_PROPERTY_TAX_RATE / 3;
  const landCity = smallLandVal * cityPlanningRate / 3 + generalLandVal * cityPlanningRate * 2 / 3;
  const landAnnual = landFixed + landCity;

  // 丸めずに小数で保持（表示側で精度を制御）
  const during = buildDuring + landAnnual;
  const after = buildAfter + landAnnual;
  return {
    during,
    after,
    reductionYears,
    buildVal,
    landVal,
    buildAuto,
    landAuto,
    buildDuring,
    buildAfter,
    landAnnual,
    cityPlanningRate,
    buildAreaM2,
    landAreaM2,
    reducedBuildVal,
    normalBuildVal,
    smallLandVal,
    generalLandVal,
    smallLandM2,
    generalLandM2,
  };
}

// ─── 3期間ローン月別シミュレーション ───
function calc3PhaseLoan(data: SimData, loanMan: number) {
  const l = data.loan;
  const rates   = l.loanType === 'fix' ? [l.fixRate1, l.fixRate2, l.fixRate3] : [l.varRate1, l.varRate2, l.varRate3];
  const periods = l.loanType === 'fix' ? [l.fixPeriod1, l.fixPeriod2, l.years] : [l.varPeriod1, l.varPeriod2, l.years];

  const prepayMap: Record<number, number> = {};
  if (l.pamount  > 0) prepayMap[l.pyear  * 12] = (prepayMap[l.pyear  * 12] || 0) + l.pamount  * 1e4;
  if (l.pamount2 > 0) prepayMap[l.pyear2 * 12] = (prepayMap[l.pyear2 * 12] || 0) + l.pamount2 * 1e4;

  const loanOutByYear: Record<number, number> = {};
  const prepayByYear: Record<number, number> = {};
  // 年末残高（経過年 y のときの残高 = y*12 ヶ月返済後の残高）
  //   balanceByYear[0] = 初期残高（返済前）
  //   balanceByYear[y] = y 年経過時点の残高（y 年分の返済を行った後）
  const startingBalance = loanMan * 1e4;
  const balanceByYear: Record<number, number> = { 0: startingBalance };
  let balance = startingBalance;
  let mo = 0, lastRate = -1, lastPhase = -1;
  let endMonth = l.years * 12;
  const bonusMonths = l.bonusTimes === 2 ? [5, 11] : l.bonusTimes === 3 ? [3, 7, 11] : l.bonusTimes === 1 ? [11] : [];

  function getRateAtMonth(m: number) {
    if (m < periods[0] * 12) return rates[0];
    if (m < periods[1] * 12) return rates[1];
    return rates[2];
  }
  function getPhaseAtMonth(m: number) {
    if (m < periods[0] * 12) return 0;
    if (m < periods[1] * 12) return 1;
    return 2;
  }

  // ボーナス払いを含め、残り期間で完済するための通常月返済額。
  // これでボーナス分を初期元本から二重に控除しない。
  function calcMonthlyWithBonus(principal: number, rate: number, startMonth: number) {
    const remainingMonths = l.years * 12 - startMonth;
    if (principal <= 0 || remainingMonths <= 0) return 0;
    const mr = rate / 100 / 12;
    let futureBonus = 0;
    for (let offset = 0; offset < remainingMonths; offset++) {
      if (bonusMonths.includes((startMonth + offset) % 12)) {
        const periodsAfterPayment = remainingMonths - offset - 1;
        futureBonus += l.bonusAmount * 1e4 * Math.pow(1 + mr, periodsAfterPayment);
      }
    }
    if (mr <= 0) return Math.max(0, (principal - futureBonus) / remainingMonths);
    const factor = Math.pow(1 + mr, remainingMonths);
    return Math.max(0, (principal * factor - futureBonus) * mr / (factor - 1));
  }

  // 各期の月返済額スナップショット
  const monthlyByPhase: [number, number, number] = [0, 0, 0];

  for (let m = 0; m < l.years * 12; m++) {
    if (balance <= 0) { endMonth = m; break; }
    const r = getRateAtMonth(m);
    const phaseIdx = getPhaseAtMonth(m);
    const mr = r / 100 / 12;
    if (r !== lastRate || phaseIdx !== lastPhase) {
      const newMo = calcMonthlyWithBonus(balance, r, m);
      mo = (l.ptype === '期間短縮' && mo > 0) ? Math.max(mo, newMo) : newMo;
      lastRate = r;
      lastPhase = phaseIdx;
      // スナップショット（期が変わるたびに該当期の月返済を記録）
      monthlyByPhase[phaseIdx] = mo;
    }
    const interest = balance * mr;
    const principal = Math.min(Math.max(0, mo - interest), balance);
    balance -= principal;
    let pay = principal + interest;
    // ボーナス払い
    if (bonusMonths.includes(m % 12) && l.bonusAmount > 0 && balance > 0) {
      const bp = Math.min(l.bonusAmount * 1e4, balance);
      balance -= bp; pay += bp;
    }
    // 繰り上げ返済
    let prepay = 0;
    if (prepayMap[m + 1] && balance > 0) {
      prepay = Math.min(prepayMap[m + 1], balance);
      balance -= prepay;
      if (l.ptype === '返済額軽減' && balance > 0) {
        mo = calcMonthlyWithBonus(balance, r, m + 1);
      }
    }
    balance = Math.max(0, balance);
    const yi = Math.floor(m / 12);
    loanOutByYear[yi] = (loanOutByYear[yi] || 0) + pay;
    prepayByYear[yi] = (prepayByYear[yi] || 0) + prepay;
    // 年末（その年の最終月）の残高を記録
    if ((m + 1) % 12 === 0) balanceByYear[yi + 1] = balance;
    if (balance <= 0) {
      // 完済後の年は残高 0 で埋める
      const finishedYear = Math.ceil((m + 1) / 12);
      for (let yy = finishedYear; yy <= l.years; yy++) balanceByYear[yy] = 0;
      endMonth = m + 1;
      break;
    }
  }
  // 念のため未記録の年も 0 で埋める（ループが正常完走した場合の保険）
  for (let yy = 1; yy <= l.years; yy++) {
    if (balanceByYear[yy] === undefined) balanceByYear[yy] = 0;
  }
  return { loanOutByYear, prepayByYear, completionMonth: endMonth, monthlyByPhase, balanceByYear };
}

// ─── 給与カーブ（現実的な昇給→ピーク→役職定年→再雇用）───
//   age ≤ 50  : 通常昇給（growthRate %/年）
//   51〜54   : 横ばい（ピーク維持）
//   55〜59   : 役職定年 −3%/年
//   60       : 再雇用 −35%（×0.65）
//   61〜     : −1%/年
export function projectSalary(baseIncome: number, baseAge: number, targetAge: number, growthRate: number): number {
  if (targetAge <= baseAge) return baseIncome;
  let income = baseIncome;
  for (let age = baseAge + 1; age <= targetAge; age++) {
    if (age <= 50) income *= (1 + growthRate / 100);
    else if (age <= 54) { /* plateau */ }
    else if (age <= 59) income *= 0.97;
    else if (age === 60) income *= 0.65;
    else income *= 0.99;
  }
  return income;
}

// ─── 年収×返済比率から逆算する最大借入額（万円）───
//   返済負担率は「住宅+他ローン」合算で判定するため、他ローンの年返済を差し引く
export function calcMaxLoan(annualIncome: number, repRatio: number, rate: number, years: number, otherLoanMonthly: number = 0): number {
  if (annualIncome <= 0 || repRatio <= 0 || years <= 0) return 0;
  const annualBudget = annualIncome * repRatio / 100;
  const annualForHousing = Math.max(0, annualBudget - otherLoanMonthly * 12);
  const monthlyMax = annualForHousing / 12;
  if (monthlyMax <= 0) return 0;
  const mr = rate / 100 / 12;
  const n = years * 12;
  if (mr <= 0) return monthlyMax * n;
  return monthlyMax * (Math.pow(1 + mr, n) - 1) / (mr * Math.pow(1 + mr, n));
}

// ─── 年金推計 ───
export function estimatePensionMonthly(income: number, workYears: number): number {
  if (income <= 0) return 0;
  const wY = Math.min(40, workYears);
  const basic = Math.round(6.5 * Math.min(1, wY / 40) * 10) / 10;
  const kosei = Math.round(income * 5.481 * wY / (1000 * 12) * 10) / 10;
  return Math.round((basic + kosei) * 10) / 10;
}

// ─── 太陽光 ───
//   月別配列を返す。優先順位:
//   1. genAuto=false & genM 12個 → genM そのまま
//   2. genAnnualKwh > 0 → 年間値を月別係数で按分
//   3. それ以外 → パネル容量×1100×パワコン効率 を月別係数で按分
export function solarMonthlyGenArr(s: SimData['solar']): number[] {
  if (!s.genAuto && s.genM.length === 12) return s.genM;
  const pcRatio = s.solarKw > 0 ? Math.min(1, s.powerconKw / s.solarKw) : 1;
  const autoAnnual = s.solarKw * 1100 * pcRatio;
  const annual = s.genAnnualKwh > 0 ? s.genAnnualKwh : autoAnnual;
  return MFACTORS.map(f => Math.round(annual * f / 12));
}

function solarAnnualFitCalc(s: SimData['solar'], d: { dailySelf: number; dailySell: number }): number {
  return d.dailySelf * 365 * s.elecPriceDay / 1e4 + d.dailySell * 365 * s.fitRate / 1e4;
}
function solarAnnualPostCalc(s: SimData['solar'], d: { dailySelf: number; dailySell: number }): number {
  return d.dailySelf * 365 * s.elecPriceDay / 1e4 + d.dailySell * 365 * s.fitRateAfter / 1e4;
}

// ─── 教育費 ───
const EDU: Record<string, { years: number; annual: number; total: number }> = {
  '公立中学':   { years: 3, annual: 52.9,  total: 158.7 },
  '私立中学':   { years: 3, annual: 143.6, total: 430.7 },
  '公立高校':   { years: 3, annual: 51.3,  total: 154 },
  '私立高校':   { years: 3, annual: 105.4, total: 316.2 },
  '国公立大学': { years: 4, annual: 60.7,  total: 242.6 },
  '私立文系':   { years: 4, annual: 93.5,  total: 396.5 },
  '私立理系':   { years: 4, annual: 129.3, total: 542.5 },
  '専門学校(2年)': { years: 2, annual: 100, total: 200 },
  '専門学校(3年)': { years: 3, annual: 90,  total: 270 },
  '就職':       { years: 0, annual: 0,     total: 0 },
};

function calcEdu(mid: string, high: string, uni: string, alone: number, aloneMonthly: number) {
  const mi = EDU[mid]  ?? { total: 0 };
  const hi = EDU[high] ?? { total: 0 };
  const ui = EDU[uni]  ?? { total: 0 };
  const aloneTotal = Math.round(aloneMonthly * 12 * alone * 10) / 10;
  return { total: (mi.total || 0) + (hi.total || 0) + (ui.total || 0) + aloneTotal };
}

// 子の今の年齢から今年の教育費を返す
function eduAnnualByAge(age: number, mid: string, high: string, uni: string): number {
  if (age >= 6  && age < 12) return EDU['公立中学']?.annual ?? 0; // 小学は公立想定
  if (age >= 12 && age < 15) return (EDU[mid]?.annual  ?? 0);
  if (age >= 15 && age < 18) return (EDU[high]?.annual ?? 0);
  if (age >= 18 && age < 18 + (EDU[uni]?.years ?? 0)) return (EDU[uni]?.annual ?? 0);
  return 0;
}

// ─── 状態判定 ───
function judgeStatus(net: number, eduMaint: number): YearRow['status'] {
  if (eduMaint >= 100) return 'big';
  if (net < 0)   return 'danger';
  if (net < 50)  return 'caution';
  if (net < 200) return 'normal';
  return 'great';
}

// ─── 手取り率（概算）───
//   FPシミュレーション簡易表示用に「世帯主・配偶者ともに一律80%」で統一
export function takeHomeRate(_annual: number): number {
  return 0.80;
}

// ─── 配偶者 産休・育休シミュレーション ───
// 概算:
//   産休: 標準報酬相当の 2/3
//   育休: 最初の6か月 67%、以降 50%
//   復帰後: 設定した収入率を通常手取りに乗じる
export const MATERNITY_LEAVE_RATE = 2 / 3;
export const CHILDCARE_LEAVE_FIRST_RATE = 0.67;
export const CHILDCARE_LEAVE_AFTER_RATE = 0.50;
export const CHILDCARE_LEAVE_FIRST_MONTHS = 6;

export function calcSpouseLeaveYear(
  basic: SimData['basic'],
  yearIndex: number,
  spouseAnnualIncome: number,
  spouseAnnualBonus: number,
) {
  const baseline = (spouseAnnualIncome + spouseAnnualBonus) * takeHomeRate(spouseAnnualIncome + spouseAnnualBonus);
  if (!basic.spouseEnabled || !basic.spouseLeaveEnabled || basic.spouseLeaveMonths <= 0) {
    return { income: baseline, loss: 0, leaveMonths: 0, returnedMonths: 0 };
  }

  const startMonth = Math.max(0, Math.round(basic.spouseLeaveStartYear * 12));
  const totalLeaveMonths = Math.max(0, Math.round(basic.spouseLeaveMonths));
  const maternityMonths = Math.min(totalLeaveMonths, Math.max(0, Math.round(basic.spouseMaternityMonths)));
  const leaveEndMonth = startMonth + totalLeaveMonths;
  const returnRate = Math.max(0, Math.min(100, basic.spouseReturnIncomeRate)) / 100;
  const monthlyGross = (spouseAnnualIncome + spouseAnnualBonus) / 12;
  const monthlyTake = baseline / 12;

  let income = 0;
  let leaveMonths = 0;
  let returnedMonths = 0;

  for (let m = 0; m < 12; m++) {
    const absoluteMonth = yearIndex * 12 + m;
    if (absoluteMonth >= startMonth && absoluteMonth < leaveEndMonth) {
      const leaveMonthIndex = absoluteMonth - startMonth;
      const rate = leaveMonthIndex < maternityMonths
        ? MATERNITY_LEAVE_RATE
        : leaveMonthIndex < maternityMonths + CHILDCARE_LEAVE_FIRST_MONTHS
          ? CHILDCARE_LEAVE_FIRST_RATE
          : CHILDCARE_LEAVE_AFTER_RATE;
      income += monthlyGross * rate;
      leaveMonths += 1;
    } else if (absoluteMonth >= leaveEndMonth && returnRate < 1) {
      income += monthlyTake * returnRate;
      returnedMonths += 1;
    } else {
      income += monthlyTake;
    }
  }

  return {
    income,
    loss: Math.max(0, baseline - income),
    leaveMonths,
    returnedMonths,
  };
}

export function calcSpouseLeaveMonthlyBreakdown(
  basic: SimData['basic'],
  spouseAnnualIncome: number,
  spouseAnnualBonus: number,
) {
  const baselineMonthly = (spouseAnnualIncome + spouseAnnualBonus) * takeHomeRate(spouseAnnualIncome + spouseAnnualBonus) / 12;
  const monthlyGross = (spouseAnnualIncome + spouseAnnualBonus) / 12;
  const totalLeaveMonths = Math.max(0, Math.round(basic.spouseLeaveMonths));
  const maternityMonths = Math.min(totalLeaveMonths, Math.max(0, Math.round(basic.spouseMaternityMonths)));
  const childcareMonths = Math.max(0, totalLeaveMonths - maternityMonths);
  const firstChildcareMonths = Math.min(childcareMonths, CHILDCARE_LEAVE_FIRST_MONTHS);
  const afterChildcareMonths = Math.max(0, childcareMonths - firstChildcareMonths);
  const returnRate = Math.max(0, Math.min(100, basic.spouseReturnIncomeRate)) / 100;

  const makeRow = (label: string, months: number, rate: number, startMonth: number, note: string) => {
    const monthlyIncome = monthlyGross * rate;
    const monthlyLoss = Math.max(0, baselineMonthly - monthlyIncome);
    return {
      label,
      months,
      startMonth,
      endMonth: startMonth + months - 1,
      rate,
      monthlyIncome,
      monthlyLoss,
      totalLoss: monthlyLoss * months,
      note,
    };
  };

  const rows = [];
  let cursor = 1;
  if (maternityMonths > 0) {
    rows.push(makeRow('産休', maternityMonths, MATERNITY_LEAVE_RATE, cursor, '出産手当金の概算'));
    cursor += maternityMonths;
  }
  if (firstChildcareMonths > 0) {
    rows.push(makeRow('育休 前半', firstChildcareMonths, CHILDCARE_LEAVE_FIRST_RATE, cursor, '育児休業給付の開始6か月'));
    cursor += firstChildcareMonths;
  }
  if (afterChildcareMonths > 0) {
    rows.push(makeRow('育休 後半', afterChildcareMonths, CHILDCARE_LEAVE_AFTER_RATE, cursor, '育児休業給付の181日目以降'));
  }

  const returnMonthlyIncome = baselineMonthly * returnRate;
  const returnMonthlyLoss = Math.max(0, baselineMonthly - returnMonthlyIncome);

  return {
    baselineMonthly,
    monthlyGross,
    rows,
    totalLeaveLoss: rows.reduce((sum, row) => sum + row.totalLoss, 0),
    returnRate,
    returnMonthlyIncome,
    returnMonthlyLoss,
  };
}

// ─── 手動給与配列ルックアップ ───
// salaryManual は 30,35,40,45,50,55,60,65歳 の年収（8要素）
export function lookupManualSalary(arr: number[], targetAge: number): number {
  if (!arr || arr.length === 0) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.floor((targetAge - 30) / 5)));
  return arr[idx] ?? 0;
}

// ─── メイン計算 ───
export function calcAll(data: SimData): CalcResult {
  const { basic, housing, loan, solar, maint, household } = data;
  const startYear = new Date().getFullYear();

  // 借入額
  const miscAmt = housing.miscMode === '100' ? housing.building : Math.round(housing.building * housing.miscPct / 100);
  const totalCost = housing.land + housing.building + housing.fuka + housing.exterior + miscAmt;
  const loanAuto = Math.max(0, totalCost - housing.down);
  const loanMan = housing.actualLoan > 0 ? housing.actualLoan : loanAuto;

  // 3期間ローン
  const lc = calc3PhaseLoan(data, loanMan);
  const monthly = lc.monthlyByPhase[0] / 1e4;
  const repaymentYears = Math.ceil(lc.completionMonth / 12);
  const completionAge = basic.age + repaymentYears;
  let actualTotalRepay = 0;
  Object.values(lc.loanOutByYear).forEach(v => actualTotalRepay += v);
  let actualPrepayTotal = 0;
  Object.values(lc.prepayByYear).forEach(v => actualPrepayTotal += v);
  actualTotalRepay = Math.round((actualTotalRepay + actualPrepayTotal) / 1e4);
  const actualTotalInt = Math.round(actualTotalRepay - loanMan);
  const taxBorrowLimit = getTaxBorrowLimit(loan.taxHouseType, loan.taxMoveInYear, loan.taxSpecialHousehold);
  const taxDeductionYears = getTaxYears(loan.taxHouseType, loan.taxMoveInYear);
  const taxLoanAmount = loan.taxLoanAmount > 0 ? Math.min(loan.taxLoanAmount, loanMan) : loanMan;
  const taxPair = basic.loanBorrowType === 'pair' && basic.spouseEnabled;
  const taxMainShare = taxPair ? (loan.taxPairMainShare > 0 ? loan.taxPairMainShare : 50) : 100;
  let taxDeductionTotal = 0, taxDeductionMain = 0, taxDeductionSpouse = 0;
  for (let y = 0; y < taxDeductionYears; y++) {
    const yearEndBalance = Math.min(taxLoanAmount, (lc.balanceByYear[y + 1] ?? 0) / 1e4);
    const main = Math.min(yearEndBalance * taxMainShare / 100, taxBorrowLimit) * 0.007;
    const spouse = taxPair ? Math.min(yearEndBalance * (100 - taxMainShare) / 100, taxBorrowLimit) * 0.007 : 0;
    taxDeductionMain += main;
    taxDeductionSpouse += spouse;
    taxDeductionTotal += main + spouse;
  }

  // 固定資産税
  const pt = calcPropertyTax(housing, loan);

  // 太陽光計算
  const monthlyGenA = solarMonthlyGenArr(solar);
  const annualKwh = monthlyGenA.reduce((a, b) => a + b, 0);
  const dailyGen = annualKwh / 365;
  const dailyUse = solar.monthlyUsage / 30;
  const dayUse = dailyUse * solar.dayUsageRatio / 100;
  const nightUse = dailyUse * (1 - solar.dayUsageRatio / 100);
  // 自家消費率: 蓄電池ON時は selfRateBatt（高い方）、OFF時は selfRateSolar を採用
  const srSolarOnly = solar.selfRateManual ? solar.selfRateSolar / 100 : Math.min(1, dayUse / Math.max(dailyGen, 0.001));
  const srBatt = solar.selfRateManual
    ? solar.selfRateBatt / 100
    : Math.min(0.95, srSolarOnly + (solar.battCapacity * Math.max(0, 1 - solar.dayUsageRatio / 100)) / Math.max(dailyGen, 0.001));
  const srEffective = solar.battEnabled ? srBatt : srSolarOnly;
  const dailySelf = dailyGen * srEffective;
  const dailySell = Math.max(0, dailyGen - dailySelf);
  const autoElecBill = Math.round(solar.monthlyUsage * (solar.dayUsageRatio / 100 * solar.elecPriceDay + (1 - solar.dayUsageRatio / 100) * solar.elecPriceNight) / 1e4 * 100) / 100;
  const effectiveElecBill = (solar.elecBillManual !== null && solar.elecBillManual > 0) ? solar.elecBillManual : autoElecBill;
  const dailyBuyDay = Math.max(0, dayUse - dailySelf);
  const afterBillRaw = Math.max(0, (dailyBuyDay * solar.elecPriceDay + nightUse * solar.elecPriceNight) * 365 / 1e4 / 12);
  const afterBill = solar.solarKw <= 0 ? effectiveElecBill : afterBillRaw;
  const solarAnnualFit = solarAnnualFitCalc(solar, { dailySelf, dailySell });
  const solarAnnualPost = solarAnnualPostCalc(solar, { dailySelf, dailySell });

  // 年金
  const workYears = Math.min(40, loan.years > 0 ? loan.years : basic.retireAge - 22);
  const wY = Math.min(40, basic.retireAge - 22);
  const spWY = basic.spouseEnabled ? Math.min(40, basic.spouseRetireAge - 22) : 0;
  const pensionM = estimatePensionMonthly(basic.income, wY);
  const spPensionM = basic.spouseEnabled ? estimatePensionMonthly(basic.spouseIncome, spWY) : 0;

  // 教育費イベント（子ごと）
  type EduEvt = Record<number, number>;
  const eduEvents: EduEvt = {};
  const kids = [
    { age: basic.c1age, mid: basic.c1mid, high: basic.c1high, uni: basic.c1uni, alone: basic.c1alone },
    { age: basic.c2age, mid: basic.c2mid, high: basic.c2high, uni: basic.c2uni, alone: basic.c2alone },
    { age: basic.c3age, mid: basic.c3mid, high: basic.c3high, uni: basic.c3uni, alone: basic.c3alone },
  ].slice(0, basic.kids);

  // キャッシュフロー（必ず60年分）
  //   初期残高 = (世帯主貯蓄 + 配偶者貯蓄) − 頭金
  const rows: YearRow[] = [];
  let balance = (basic.savings + (basic.spouseSavings ?? 0) - housing.down) * 1e4;

  // 現役月支出（家計費合計）
  const hhWork = (household.food + household.transport + household.daily + household.clothes
    + household.hobby + household.car + household.social + household.medical + household.other
    + household.ins1 + household.ins2 + household.ins3 + household.ins4 + household.ins5 + household.ins6
    + household.otherLoan) * 1e4;
  // 退職後月支出
  const hhRet = (household.retFood + household.retTransport + household.retDaily + household.retClothes
    + household.retHobby + household.retCar + household.retSocial + household.retMedical + household.retOther
    + household.retIns1 + household.retIns2 + household.retIns3 + household.retIns4) * 1e4;

  // 生涯集計（simYears 期間内のみ加算）
  const lp = data.simYears;
  let lifeIncWage = 0, lifeIncPension = 0, lifeIncRetBonus = 0, lifeIncTaxBack = 0, lifeIncSolar = 0, lifeIncSiPayout = 0;
  let lifeLeaveIncomeLoss = 0;
  let lifeExpLoanPay = 0, lifeExpPropTax = 0, lifeExpLiving = 0, lifeExpUtility = 0, lifeExpEdu = 0, lifeExpMaint = 0, lifeExpSudden = 0, lifeExpSiPaid = 0;

  for (let y = 0; y < 60; y++) {
    const age = basic.age + y;
    const calYear = startYear + y;
    const events: string[] = [];
    const isWork = age < basic.retireAge;

    // ─── 収入（手取り概算） ───
    //   主・配偶者それぞれ独立に「給与 / 年金 / 空白期間」を切替
    //     - 給与: age < retireAge（その人の定年年齢）
    //     - 年金: age >= pensionStartAge（共通の年金開始年齢）
    //     - 空白期間: retireAge ≤ age < pensionStartAge（退職済みだが年金未開始）→ 無収入
    let income = 0;
    // 主の収入
    if (age < basic.retireAge) {
      const mainInc = basic.salaryAuto
        ? projectSalary(basic.income, basic.age, age, basic.incomeGrowth)
        : lookupManualSalary(basic.salaryManual, age);
      const mainBonus = basic.annualBonusInc;
      const thr = takeHomeRate(mainInc);
      income += (mainInc + mainBonus) * thr;
    } else if (age >= basic.pensionStartAge) {
      income += pensionM * 12;
    }
    // 配偶者の収入
    let leaveIncomeLoss = 0;
    if (basic.spouseEnabled) {
      const spAge = basic.spouseAge + y;
      if (spAge < basic.spouseRetireAge) {
        const spInc = basic.salSpouseAuto
          ? projectSalary(basic.spouseIncome, basic.spouseAge, spAge, basic.spouseGrowth)
          : lookupManualSalary(basic.spouseSalaryManual, spAge);
        const spBonus = basic.spouseAnnualBonusInc;
        const leave = calcSpouseLeaveYear(basic, y, spInc, spBonus);
        income += leave.income;
        leaveIncomeLoss = leave.loss;
        if (leave.leaveMonths > 0) {
          events.push(`配偶者 産休・育休中 (${leave.leaveMonths}か月)`);
        }
        if (leave.returnedMonths > 0 && basic.spouseReturnIncomeRate < 100) {
          events.push(`配偶者 復帰後時短 (${basic.spouseReturnIncomeRate}%)`);
        }
      } else if (spAge >= basic.pensionStartAge) {
        income += spPensionM * 12;
      }
    }

    // 退職金
    let retBonusY = 0;
    if (age === basic.retireAge) {
      retBonusY = basic.retireBonus + (basic.spouseEnabled ? basic.spouseRetireBonus : 0);
      events.push('定年退職', '退職金入金');
    }
    if (age === basic.pensionStartAge) events.push('年金開始');

    // ─── 支出 ───
    // ローン（通常返済 + 繰上返済を合算してキャッシュ支出に計上）
    const regularLoanPay = Math.round((lc.loanOutByYear[y] || 0) / 1e4);
    const prepayY = Math.round((lc.prepayByYear[y] || 0) / 1e4);
    const loanPay = regularLoanPay + prepayY;
    // 残高は実際の月別シミュレーション結果を使用（金利切替・ボーナス・繰上返済を反映）
    //   ローン期間を超えた年は 0
    const loanBalance = y > loan.years
      ? 0
      : Math.round((lc.balanceByYear[y] ?? 0) / 1e4);
    if (prepayY > 0) events.push(`⏩ 繰上返済 ${prepayY}万`);
    if (y > 0 && regularLoanPay === 0 && Math.round((lc.loanOutByYear[y - 1] || 0) / 1e4) > 0) events.push('ローン完済');

    // 住宅ローン減税（年末残高×0.7%、借入限度額あり）
    // ボーナス払い・繰上返済後の実際の年末残高を基準にする。
    const yearEndBalance = Math.min(taxLoanAmount, (lc.balanceByYear[y + 1] ?? 0) / 1e4);
    const loanTaxMain = y < taxDeductionYears
      ? Math.min(yearEndBalance * taxMainShare / 100, taxBorrowLimit) * 0.007
      : 0;
    const loanTaxSp = taxPair && y < taxDeductionYears
      ? Math.min(yearEndBalance * (100 - taxMainShare) / 100, taxBorrowLimit) * 0.007
      : 0;
    const loanTaxBack = loanTaxMain + loanTaxSp;

    // 貯蓄型保険の月々支払い（満期前のみ・万円/月）
    const siMonthly = (data.savingsInsurances ?? [])
      .filter(si => y < si.payoutYear)
      .reduce((sum, si) => sum + si.monthly, 0);
    // 貯蓄型保険の満期受取（その年に下りる金額・万円）
    let siPayout = 0;
    for (const si of (data.savingsInsurances ?? [])) {
      if (si.payoutYear === y && si.payoutAmount > 0) {
        siPayout += si.payoutAmount;
        events.push(`💎 ${si.name || '貯蓄型保険'}満期 +${si.payoutAmount}万`);
      }
    }

    // 生活費（光熱費除く）— 貯蓄型保険の月々支払いも加算
    const livingOut = (isWork ? hhWork : hhRet) * 12 + siMonthly * 1e4 * 12;

    // 光熱費（電気/ガス/水道を別々に計上 ※ 退職後は LCC の retUtility を採用）
    //   電気代は「太陽光なしの現在の電気代」を採用。太陽光効果（節電+売電）は別途 solarB として net に加算
    let utilityY: number;
    if (isWork) {
      const elec = effectiveElecBill;  // 現在の電気代（noSolarMonthly 相当）
      const gasW = household.gasMonthly;
      const water = household.waterMonthly;
      utilityY = (elec + gasW + water) * 12;
    } else {
      // 退職後はLCCシートで設定したretUtility（月額合計）を採用
      utilityY = (household.retUtility > 0 ? household.retUtility : (household.electricMonthly + household.gasMonthly + household.waterMonthly)) * 12;
    }

    // 固定資産税
    const propTax = y < pt.reductionYears ? pt.during : pt.after;

    // 教育費
    let eduCost = 0;
    for (const k of kids) {
      const childAge = k.age + y;
      const ea = eduAnnualByAge(childAge, k.mid, k.high, k.uni);
      eduCost += ea;
      // 仕送り（大学期間と一致する場合）
      const uniYears = EDU[k.uni]?.years ?? 0;
      if (uniYears > 0 && childAge >= 18 && childAge < 18 + Math.min(k.alone, uniYears)) {
        eduCost += basic.aloneMonthly * 12;
      }
    }

    // メンテ費
    let maintCost = 0;
    const maintDetails: string[] = [];
    for (const it of maint.items) {
      if (!it.enabled || it.cycleYears <= 0) continue;
      if (y > 0 && y % it.cycleYears === 0) { maintCost += it.cost; maintDetails.push(it.name); }
    }
    // 太陽光メンテ（パワコン・点検・蓄電池）
    if (solar.enabled && solar.solarKw > 0 && y > 0) {
      if (solar.powerconCycle > 0 && y % solar.powerconCycle === 0) { maintCost += solar.powerconCost; maintDetails.push('🔧パワコン'); }
      if (solar.solarMaintCycle > 0 && y % solar.solarMaintCycle === 0) { maintCost += solar.solarMaintCost; maintDetails.push('☀点検'); }
      if (solar.battEnabled && solar.battReplaceCycle > 0 && y % solar.battReplaceCycle === 0) { maintCost += solar.battReplaceCost; maintDetails.push('🔋蓄電池'); }
    }
    if (maintDetails.length > 0) events.push('メンテ: ' + maintDetails.join('・'));

    // 太陽光効果（年） — 太陽光導入ONかつ容量>0の時のみ
    const solarB = (solar.enabled && solar.solarKw > 0)
      ? (y < solar.fitYears ? solarAnnualFit : solarAnnualPost)
      : 0;

    // 急な出費（cycleYears ごとに周期発生）
    //   y > 0 かつ y を cycleYears で割り切れる年に発生
    let suddenY = 0;
    for (const e of (data.suddenExpenses ?? [])) {
      if (e.cycleYears > 0 && y > 0 && y % e.cycleYears === 0 && e.amount > 0) {
        suddenY += e.amount;
        events.push(`💸 ${e.name || '臨時支出'} ${e.amount}万`);
      }
    }

    // 収支（太陽光効果・貯蓄型保険満期は収入として加算、急な出費は支出）
    const totalOut = loanPay + livingOut / 1e4 + utilityY + propTax + eduCost + maintCost + suddenY;
    const net = income + retBonusY + loanTaxBack + solarB + siPayout - totalOut;

    // 生涯集計（simYears 内のみ）
    if (y < lp) {
      if (isWork) lifeIncWage += income;
      else lifeIncPension += income;
      lifeIncRetBonus += retBonusY;
      lifeIncTaxBack += loanTaxBack;
      lifeIncSolar += solarB;
      lifeIncSiPayout += siPayout;
      lifeLeaveIncomeLoss += leaveIncomeLoss;
      lifeExpLoanPay += loanPay;
      lifeExpPropTax += propTax;
      lifeExpLiving += livingOut / 1e4 - siMonthly * 12;  // 純生活費（保険料を除く）
      lifeExpUtility += utilityY;
      lifeExpEdu += eduCost;
      lifeExpMaint += maintCost;
      lifeExpSudden += suddenY;
      lifeExpSiPaid += siMonthly * 12;
    }
    balance += net * 1e4;

    rows.push({
      year: y, calYear, age,
      income: Math.round(income + retBonusY + loanTaxBack + siPayout),
      loanPay,
      living: Math.round(livingOut / 1e4),
      utility: Math.round(utilityY),
      propTax,
      eduCost: Math.round(eduCost),
      maintCost: Math.round(maintCost),
      solarBenefit: Math.round(solarB),
      leaveIncomeLoss: Math.round(leaveIncomeLoss),
      sudden: Math.round(suddenY),
      taxBack: Math.round(loanTaxBack),
      retBonus: Math.round(retBonusY),
      net: Math.round(net),
      balance: Math.round(balance / 1e4),
      status: judgeStatus(Math.round(net), Math.round(eduCost + maintCost)),
      events,
      loanBalance,
    });
  }

  // LCC集計（simYears範囲）— lp は上で定義済み
  const within = rows.slice(0, lp);
  const sum = (key: keyof YearRow) => within.reduce((a, r) => a + (r[key] as number), 0);

  // 固定資産税のlccP年総額
  let propTaxTotal = 0;
  for (let y = 0; y < lp; y++) propTaxTotal += y < pt.reductionYears ? pt.during : pt.after;

  // 太陽光LCC費用（太陽光 / 蓄電池 それぞれの導入ON時のみ計上）
  const solarLccCost =
    (solar.enabled && solar.solarKw > 0 ? solar.solarCost : 0)
    + (solar.battEnabled ? solar.battCost : 0);

  const lccGrand = sum('utility') + propTaxTotal + sum('eduCost') + sum('maintCost') + solarLccCost;

  return {
    rows,
    loan: loanMan,
    loanAuto,
    miscAmt,
    totalCost,
    monthly,
    monthlyPhase1: lc.monthlyByPhase[0] / 1e4,
    monthlyPhase2: lc.monthlyByPhase[1] / 1e4,
    monthlyPhase3: lc.monthlyByPhase[2] / 1e4,
    repaymentYears,
    completionAge,
    actualTotalRepay,
    actualTotalInt,
    taxBorrowLimit,
    taxDeductionYears,
    taxDeductionTotal: Math.round(taxDeductionTotal * 10) / 10,
    taxDeductionMain: Math.round(taxDeductionMain * 10) / 10,
    taxDeductionSpouse: Math.round(taxDeductionSpouse * 10) / 10,
    totalUtility: sum('utility'),
    totalPropTax: propTaxTotal,
    totalEdu: sum('eduCost'),
    totalMaint: sum('maintCost'),
    totalSolar: sum('solarBenefit'),
    totalLiving: sum('living'),
    lccGrand,
    solarAnnualFit,
    solarAnnualPost,
    annualKwh,
    afterBill,
    effectiveElecBill,
    pensionM,
    spPensionM,
    // 生涯集計（simYears期間内）— 提案書サマリー用
    lifeIncWage: Math.round(lifeIncWage),
    lifeIncPension: Math.round(lifeIncPension),
    lifeIncRetBonus: Math.round(lifeIncRetBonus),
    lifeIncTaxBack: Math.round(lifeIncTaxBack),
    lifeIncSolar: Math.round(lifeIncSolar),
    lifeIncSiPayout: Math.round(lifeIncSiPayout),
    lifeLeaveIncomeLoss: Math.round(lifeLeaveIncomeLoss),
    lifeExpLoanPay: Math.round(lifeExpLoanPay),
    lifeExpPropTax: Math.round(lifeExpPropTax),
    lifeExpLiving: Math.round(lifeExpLiving),
    lifeExpUtility: Math.round(lifeExpUtility),
    lifeExpEdu: Math.round(lifeExpEdu),
    lifeExpMaint: Math.round(lifeExpMaint),
    lifeExpSudden: Math.round(lifeExpSudden),
    lifeExpSiPaid: Math.round(lifeExpSiPaid),
  };
}

export function useCalculations(data: SimData): CalcResult {
  return useMemo(() => calcAll(data), [data]);
}

// export helpers for tabs
export { calcEdu, eduAnnualByAge };
