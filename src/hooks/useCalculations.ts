import { useMemo } from 'react';
import type { SimData, CalcResult, YearRow, LoanPlan, HouseType } from '../types';
import { DEFAULT_DATA } from '../lib/defaults';
import { energyYear, solarInitialCost, solarMaintenance, clamp } from '../lib/energy';
import { calcEdu, eduAnnualByAge, childrenOf, childEducation } from '../lib/education';
import { occursInYear } from '../lib/suddenExpenses';
import { loanSchedule } from '../lib/loans';
export { solarMonthlyGenArr } from '../lib/energy';

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
  if (moveInYear < 2026 || moveInYear > 2030) return 0;
  if (houseType === 'long_term') return specialHousehold ? 5000 : 4500;
  if (houseType === 'zeh') return specialHousehold ? 4500 : 3500;
  return currentRule ? (specialHousehold ? 3000 : 2000) : 0;
}
export function getTaxYears(houseType: HouseType, moveInYear: number): number {
  if (moveInYear < 2026 || moveInYear > 2030) return 0;
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
  const baseline = (spouseAnnualIncome + spouseAnnualBonus) * clamp((basic.spouseTakeHomePct ?? 80) / 100, 0, 1);
  if (!basic.spouseEnabled || !basic.spouseLeaveEnabled || basic.spouseLeaveMonths <= 0) {
    return { income: baseline, loss: 0, leaveMonths: 0, returnedMonths: 0 };
  }

  const startMonth = Math.max(0, Math.round(basic.spouseLeaveStartYear * 12));
  const totalLeaveMonths = Math.max(0, Math.round(basic.spouseLeaveMonths));
  const maternityMonths = Math.min(totalLeaveMonths, Math.max(0, Math.round(basic.spouseMaternityMonths)));
  const leaveEndMonth = startMonth + totalLeaveMonths;
  const returnRate = Math.max(0, Math.min(100, basic.spouseReturnIncomeRate)) / 100;
  const monthlyGross = spouseAnnualIncome / 12;
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
  const baselineMonthly = (spouseAnnualIncome + spouseAnnualBonus) * clamp((basic.spouseTakeHomePct ?? 80) / 100, 0, 1) / 12;
  const monthlyGross = spouseAnnualIncome / 12;
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
  const { basic: b, housing: h, loan: l, solar: s, household: hh } = data;
  const startYear = Number(b.date?.slice(0, 4)) || new Date().getFullYear();
  const warnings: string[] = [];
  const miscAmt = h.miscMode === '100' ? h.building : h.building * h.miscPct / 100;
  const solarInitial = solarInitialCost(s);
  const baseCost = h.land + h.building + h.fuka + h.exterior + miscAmt;
  const totalCost = baseCost + (s.funding === 'included' ? 0 : solarInitial);
  const mortgageCost = baseCost + (s.funding === 'loan' ? solarInitial : 0);
  const loanAuto = Math.max(0, mortgageCost - h.down);
  const loanMan = h.actualLoan > 0 ? h.actualLoan : loanAuto;
  const cashRequired = Math.max(0, totalCost - loanMan);
  const initialSavings = b.savings + (b.spouseEnabled ? b.spouseSavings : 0);
  const initialCash = initialSavings - cashRequired;
  const lc = loanSchedule(l, loanMan);
  const monthly = lc.phaseMonthly.find(v => v > 0) ?? 0;
  const repaymentYears = loanMan > 0 ? Math.ceil(lc.completionMonth / 12) : 0;
  const pt = calcPropertyTax(h, l);
  const firstEnergy = energyYear(data);
  const postEnergy = energyYear({ ...data, solar: { ...s, fitYears: 0 } });
  const pensionM = b.pensionMonthly ?? estimatePensionMonthly(b.income, Math.max(0, b.retireAge - 22)) * 0.9;
  const spPensionM = b.spouseEnabled
    ? b.spousePensionMonthly ?? estimatePensionMonthly(b.spouseIncome, Math.max(0, b.spouseRetireAge - 22)) * 0.9 : 0;
  const kids = childrenOf(b);
  const costs = data.educationCosts ?? DEFAULT_DATA.educationCosts;
  const workLiving = hh.food + hh.transport + hh.daily + hh.clothes + hh.hobby + hh.car + hh.social + hh.medical + hh.other
    + hh.ins1 + hh.ins2 + hh.ins3 + hh.ins4 + hh.ins5 + hh.ins6;
  const retLiving = hh.retFood + hh.retTransport + hh.retDaily + hh.retClothes + hh.retHobby + hh.retCar + hh.retSocial
    + hh.retMedical + hh.retOther + hh.retIns1 + hh.retIns2 + hh.retIns3 + hh.retIns4;
  const taxBorrowLimit = getTaxBorrowLimit(l.taxHouseType, l.taxMoveInYear, l.taxSpecialHousehold);
  const taxDeductionYears = getTaxYears(l.taxHouseType, l.taxMoveInYear);
  const taxPair = b.loanBorrowType === 'pair' && b.spouseEnabled;
  const share = taxPair ? clamp(l.taxPairMainShare, 0, 100) / 100 : 1;
  const eligibleLoanFraction = loanMan > 0 && l.taxLoanAmount > 0 ? Math.min(1, l.taxLoanAmount / loanMan) : 1;
  const taxBaseMain = ((b.salaryAuto ? b.income : lookupManualSalary(b.salaryManual, b.age)) + b.annualBonusInc) * (b.takeHomePct ?? 80) / 100;
  const taxBaseSpouse = ((b.salSpouseAuto ? b.spouseIncome : lookupManualSalary(b.spouseSalaryManual, b.spouseAge)) + b.spouseAnnualBonusInc) * (b.spouseTakeHomePct ?? 80) / 100;
  let taxDeductionMain = 0, taxDeductionSpouse = 0;
  let otherBalance = Math.max(0, hh.otherLoanBalance);
  let balance = initialCash;
  const rows: YearRow[] = [];

  if (initialCash < 0) warnings.push('購入時の自己資金が不足しています。借入額と初期費用を再確認してください。');
  if (loanMan > mortgageCost) warnings.push('借入額が住宅・ローン対象設備費を上回っています。超過借入分は使途未確認のため手元資金に加えていません。');
  if (h.actualLoan > 0 && Math.abs(h.actualLoan - loanAuto) > 0.01) warnings.push('実借入額を優先し、総費用との差額を貯蓄から支出します。表示上の頭金とは一致しない場合があります。');
  if (l.years < 1 || l.years > 60 || !Number.isInteger(l.years)) warnings.push('返済期間は1〜60年の整数が必要です。未確定の入力では提案に使用しないでください。');
  if ((l.pamount > 0 && (l.pyear < 1 || l.pyear > l.years)) || (l.pamount2 > 0 && (l.pyear2 < 1 || l.pyear2 > l.years)))
    warnings.push('繰上返済年は返済期間内の1年目以降で設定してください。');
  if (hh.otherLoan > 0 && hh.otherLoanBalance <= 0 && hh.otherLoanMonths <= 0)
    warnings.push('他ローンの残高・残り月数が未入力です。過小評価を避けるため月々の返済を60年間計上しています。残高または残り月数を入力してください。');
  if (hh.otherLoanBalance > 0 && hh.otherLoan <= hh.otherLoanBalance * (hh.otherLoanRate ?? 0) / 1200)
    warnings.push('他ローンの返済額が利息以下です。残高が減りません。');
  if (b.pensionMonthly === null || (b.spouseEnabled && b.spousePensionMonthly === null))
    warnings.push('年金は簡易推計（概算額の90%を手取り扱い）です。ねんきん定期便等の見込額・税社会保険料で確認してください。');
  if (b.salaryAuto || (b.spouseEnabled && b.salSpouseAuto))
    warnings.push('給与の自動推移は50歳まで昇給、51〜54歳横ばい、55〜59歳年3%減、60歳35%減、以降年1%減の仮定です。勤務先の実態を確認してください。');
  if (b.spouseEnabled && b.spouseLeaveEnabled) warnings.push('産休・育休給付は概算率による計算です。給付上限・受給資格・追加給付は未反映のため、勤務先の見込額を確認してください。');
  if (b.loanBorrowType === 'pair' && b.spouseEnabled) warnings.push('ペアローンは共通の金利・返済期間で合算試算します。契約が異なる場合は個別の返済予定表との照合が必要です。');
  if (b.retireAge > b.pensionStartAge || (b.spouseEnabled && b.spouseRetireAge > b.pensionStartAge)) warnings.push('在職中の年金減額は自動計算しません。年金の手取り見込額で確認してください。');
  if (l.taxInclude) warnings.push('住宅ローン控除は確認した年間上限の範囲で概算計上します。所得・居住・床面積・持分・繰上返済などの適用条件と実際の税額は別途確認が必要です。');
  else warnings.push('住宅ローン控除は未確認のため手元資金に加えていません。');
  if (l.taxMoveInYear !== startYear) warnings.push('試算開始年と入居年が一致していません。控除は資金計画へ計上していません。');
  if (l.taxMoveInYear < 2026 || l.taxMoveInYear > 2030) warnings.push('入力した入居年は控除の対応範囲（2026〜2030年）外です。');
  if (l.taxHouseType === 'general' && l.taxMoveInYear >= 2028) warnings.push('2028年以降の省エネ基準適合住宅の経過措置は個別確認が必要です。控除は計上していません。');
  if (h.propTaxBuildingValue === null || h.propTaxLandValue === null)
    warnings.push('固定資産税は出雲市の税率・仮評価額による概算です。評価替え・建物の経年減価は含みません。市外の物件は別途確認してください。');
  if (s.enabled && s.solarKw > 0) {
    if (s.fitStepYears > s.fitYears) warnings.push('売電の第1段階終了がFIT終了より後です。FIT終了後単価が優先されるため、契約期間を修正してください。');
    warnings.push(s.funding === 'included' ? '太陽光・蓄電池の初期費用は建物等の見積に含む設定です。見積で二重計上・計上漏れがないか確認してください。'
      : s.funding === 'loan' ? '太陽光・蓄電池の初期費用を住宅費に加算しています。実借入額が手動の場合は借入増額の確認が必要です。' : '太陽光・蓄電池の初期費用を現金支出として購入時に計上しています。');
    warnings.push('発電・自家消費は月別平均による概算です。天候・積雪・影・機器の実効容量・料金改定を保証しません。売電契約の単価と期間をご確認ください。');
    if (s.battEnabled && s.battCost <= 0) warnings.push('蓄電池が有効ですが初期費用は0円です。見積に含むか確認してください。');
  }
  if (s.battEnabled && (!s.enabled || s.solarKw <= 0)) warnings.push('蓄電池単独での運用は未対応です。太陽光が無効のため、設備費・効果は計上していません。');
  if (hh.inflationRate === 0) warnings.push('物価上昇率は0%です。長期の生活費・教育費・修繕費が変わらない仮定になっています。');
  if (!(data.suddenExpenses ?? []).some(e => /旅行/.test(e.name) && e.amount > 0)) warnings.push('旅行の予定支出が未設定です。希望がある場合は金額を追加してください。');
  if (!(data.suddenExpenses ?? []).some(e => /車.*(替|購入)/.test(e.name) && e.amount > 0)) warnings.push('車の買い替えが未設定です。月々の車両費と分けて確認してください。');
  warnings.push('0〜2歳の保育料、大学等の入学金・教材費、介護・災害・相続・児童手当・補助金・運用益・不動産売却額は自動計上しません。必要な支出は予定支出に追加してください。');

  for (let y = 0; y < 60; y++) {
    const year = y + 1;
    const ageStart = b.age + y;
    const spouseAgeStart = b.spouseAge + y;
    const isWork = ageStart < b.retireAge;
    const events: string[] = [];
    const factor = (1 + clamp(hh.inflationRate, 0, 20) / 100) ** y;
    let wage = 0, pension = 0, mainWage = 0, spouseWage = 0, leaveIncomeLoss = 0;
    if (isWork) {
      const gross = b.salaryAuto ? projectSalary(b.income, b.age, ageStart, b.incomeGrowth) : lookupManualSalary(b.salaryManual, ageStart);
      mainWage = (gross + b.annualBonusInc) * clamp(b.takeHomePct ?? 80, 0, 100) / 100;
      wage += mainWage;
    }
    if (ageStart >= b.pensionStartAge) pension += pensionM * 12;
    if (b.spouseEnabled) {
      if (spouseAgeStart < b.spouseRetireAge) {
        const gross = b.salSpouseAuto ? projectSalary(b.spouseIncome, b.spouseAge, spouseAgeStart, b.spouseGrowth) : lookupManualSalary(b.spouseSalaryManual, spouseAgeStart);
        const leave = calcSpouseLeaveYear(b, y, gross, b.spouseAnnualBonusInc);
        spouseWage = leave.income;
        wage += spouseWage;
        leaveIncomeLoss = leave.loss;
        if (leave.leaveMonths > 0) events.push('配偶者 産休・育休 ' + leave.leaveMonths + 'か月');
      }
      if (spouseAgeStart >= b.pensionStartAge) pension += spPensionM * 12;
    }
    let retBonus = 0;
    if (b.retireAge > b.age && year === b.retireAge - b.age) {
      retBonus += b.retireBonus; events.push('世帯主退職');
    }
    if (b.spouseEnabled && b.spouseRetireAge > b.spouseAge && year === b.spouseRetireAge - b.spouseAge) {
      retBonus += b.spouseRetireBonus; events.push('配偶者退職');
    }
    const mortgage = lc.annual[y];
    const loanPay = mortgage.paid + mortgage.prepaid;
    if (mortgage.prepaid > 0) events.push('繰上返済 ' + mortgage.prepaid.toFixed(1) + '万円');
    let otherLoanPay = 0;
    for (let m = 0; m < 12; m++) {
      const elapsed = y * 12 + m;
      if (hh.otherLoanBalance > 0) {
        const due = otherBalance * (1 + clamp(hh.otherLoanRate ?? 0, 0, 100) / 1200);
        const payment = Math.min(due, hh.otherLoan);
        otherBalance = Math.max(0, due - payment);
        otherLoanPay += payment;
      } else if (hh.otherLoanMonths <= 0 || elapsed < hh.otherLoanMonths) otherLoanPay += hh.otherLoan;
    }
    let insurancePremium = 0, insurancePayout = 0;
    for (const si of data.savingsInsurances ?? []) {
      if (si.payoutYear >= year) insurancePremium += si.monthly * 12;
      if (si.payoutYear === year) { insurancePayout += si.payoutAmount; events.push((si.name || '貯蓄型保険') + ' 満期'); }
    }
    const living = (isWork ? workLiving : retLiving) * 12 * factor + insurancePremium + otherLoanPay;
    const energy = energyYear(data, y);
    const utilityBaseline = (isWork || hh.retUtility <= 0 ? energy.baselineMonthly + hh.gasMonthly + hh.waterMonthly : hh.retUtility) * 12;
    const solarSaving = Math.min(energy.saving, utilityBaseline) * factor;
    const utility = Math.max(0, utilityBaseline * factor - solarSaving);
    const solarSale = energy.sale;
    const propTax = y < pt.reductionYears ? pt.during : pt.after;
    const eduCost = kids.reduce((a, k) => a + childEducation(k, y, b, costs), 0) * factor;
    let maintCost = solarMaintenance(s, year) * factor;
    for (const item of data.maint.items) {
      if (item.enabled && item.cycleYears > 0 && year % Math.max(1, Math.round(item.cycleYears)) === 0) {
        maintCost += item.cost * factor; events.push(item.name);
      }
    }
    if (solarMaintenance(s, year) > 0) events.push('太陽光設備の点検・更新');
    let sudden = 0;
    for (const e of data.suddenExpenses ?? []) if (occursInYear(e, year)) {
      sudden += e.amount * factor; events.push(e.name || '予定支出');
    }
    let taxBack = 0;
    if (l.taxInclude && l.taxMoveInYear === startYear && y < taxDeductionYears && l.years >= 10 && mortgage.deductionEligible) {
      const eligibleBalance = mortgage.balance * eligibleLoanFraction;
      const capMain = l.taxAnnualCap * Math.min(1, mainWage / Math.max(0.01, taxBaseMain));
      const capSpouse = l.taxSpouseAnnualCap * Math.min(1, spouseWage / Math.max(0.01, taxBaseSpouse));
      const main = Math.max(0, Math.min(eligibleBalance * share, taxBorrowLimit) * 0.007);
      const spouse = taxPair ? Math.max(0, Math.min(eligibleBalance * (1 - share), taxBorrowLimit) * 0.007) : 0;
      const mainBack = Math.min(main, capMain), spouseBack = Math.min(spouse, capSpouse);
      taxBack = mainBack + spouseBack;
      taxDeductionMain += mainBack; taxDeductionSpouse += spouseBack;
    }
    const income = wage + pension + retBonus + insurancePayout + taxBack;
    const totalOut = loanPay + living + utility + propTax + eduCost + maintCost + sudden;
    const net = income + solarSale - totalOut;
    balance += net;
    rows.push({
      year, calYear: startYear + year, age: b.age + year, income, wage, pension, retBonus,
      insurancePayout, insurancePremium, loanPay, prepaid: mortgage.prepaid, otherLoanPay, otherLoanBalance: otherBalance,
      living, utility, propTax, eduCost, maintCost, solarBenefit: solarSale, solarSale, solarSaving,
      leaveIncomeLoss, sudden, taxBack, net, balance, totalOut, loanBalance: mortgage.balance,
      status: judgeStatus(net, eduCost + maintCost + sudden), events,
    });
  }
  const within = rows.slice(0, data.simYears);
  const sum = (key: keyof YearRow) => within.reduce((a, r) => a + (typeof r[key] === 'number' ? r[key] as number : 0), 0);
  return {
    rows, initialSavings, initialCash, cashRequired, solarInitial, warnings,
    loan: loanMan, loanAuto, miscAmt, totalCost, monthly,
    monthlyPhase1: lc.phaseMonthly[0], monthlyPhase2: lc.phaseMonthly[1], monthlyPhase3: lc.phaseMonthly[2],
    repaymentYears, completionAge: b.age + repaymentYears, actualTotalRepay: lc.totalPaid, actualTotalInt: lc.totalInterest,
    taxBorrowLimit, taxDeductionYears, taxDeductionTotal: taxDeductionMain + taxDeductionSpouse, taxDeductionMain, taxDeductionSpouse,
    totalUtility: sum('utility'), totalPropTax: sum('propTax'), totalEdu: sum('eduCost'), totalMaint: sum('maintCost'),
    totalSolar: sum('solarSaving') + sum('solarSale'), totalLiving: sum('living'),
    lccGrand: cashRequired + sum('totalOut'),
    solarAnnualFit: firstEnergy.benefit, solarAnnualPost: postEnergy.benefit, annualKwh: firstEnergy.generation,
    afterBill: firstEnergy.afterMonthly, effectiveElecBill: firstEnergy.baselineMonthly, pensionM, spPensionM,
    lifeIncWage: sum('wage'), lifeIncPension: sum('pension'), lifeIncRetBonus: sum('retBonus'), lifeIncTaxBack: sum('taxBack'),
    lifeIncSolar: sum('solarSale'), lifeIncSiPayout: sum('insurancePayout'), lifeLeaveIncomeLoss: sum('leaveIncomeLoss'),
    lifeExpLoanPay: sum('loanPay'), lifeExpPropTax: sum('propTax'), lifeExpLiving: sum('living') - sum('insurancePremium'),
    lifeExpUtility: sum('utility'), lifeExpEdu: sum('eduCost'), lifeExpMaint: sum('maintCost'),
    lifeExpSudden: sum('sudden'), lifeExpSiPaid: sum('insurancePremium'),
  };
}

export function useCalculations(data: SimData): CalcResult {
  return useMemo(() => calcAll(data), [data]);
}

// export helpers for tabs
export { calcEdu, eduAnnualByAge };
