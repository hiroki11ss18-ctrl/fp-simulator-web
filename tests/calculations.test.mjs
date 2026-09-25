import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ configFile: false, envDir: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(async () => { await server.close(); });
const { calcAll, calcMonthly, calcMaxLoan, calcPropertyTax, getTaxBorrowLimit } = await server.ssrLoadModule('/src/hooks/useCalculations.ts');
const { DEFAULT_DATA } = await server.ssrLoadModule('/src/lib/defaults.ts');
const { energyYear, solarMaintenance } = await server.ssrLoadModule('/src/lib/energy.ts');
const { loanSchedule } = await server.ssrLoadModule('/src/lib/loans.ts');
const { normalizeData } = await server.ssrLoadModule('/src/lib/data.ts');
const { buildOverview, buildLifeStageExpenses, makeStressData } = await server.ssrLoadModule('/src/lib/planning.ts');
const { occursInYear } = await server.ssrLoadModule('/src/lib/suddenExpenses.ts');
const { default: PrintProposal } = await server.ssrLoadModule('/src/components/PrintProposal.tsx');
const { default: HousingPlan } = await server.ssrLoadModule('/src/components/tabs/HousingPlan.tsx');
const { default: Summary } = await server.ssrLoadModule('/src/components/tabs/Summary.tsx');
const { PROPOSAL_STYLES } = await server.ssrLoadModule('/src/lib/proposalStyles.ts');
const fresh = () => { const d = structuredClone(DEFAULT_DATA); d.basic.date = '2026-09-22'; return d; };
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

test('saved proposal uses unescaped trusted CSS but escapes customer text', () => {
  const d = fresh(); d.basic.customerName = '<script>alert(1)</script>';
  const html = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: calcAll(d) }));
  assert.ok(html.includes(PROPOSAL_STYLES)); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('60年 / 93歳'));
});

test('FIT 2026 changes at years 5 and 11, with physical generation unchanged', () => {
  const d = fresh(); d.solar.degradationPct = 0;
  const y4 = energyYear(d, 3), y5 = energyYear(d, 4), y10 = energyYear(d, 9), y11 = energyYear(d, 10);
  assert.ok(y4.sold > 0); near(y4.sale / y4.sold, 24 / 1e4);
  near(y5.sale / y5.sold, 8.3 / 1e4); near(y10.sale / y10.sold, 8.3 / 1e4);
  near(y11.sale / y11.sold, 8 / 1e4); near(y4.generation, y5.generation);
});
test('legacy flat FIT preserves the original contract through year 10', () => {
  const d = fresh(); delete d.solar.fitStepYears; delete d.solar.fitRateMiddle; d.solar.fitRate = 16;
  const restored = normalizeData(d); assert.equal(restored.solar.fitStepYears, 10);
  const y5 = energyYear(restored, 4); near(y5.sale / y5.sold, 16 / 1e4);
});
test('zero battery efficiency delivers no energy and never produces NaN', () => {
  const d = fresh(); d.solar.battEnabled = true; d.solar.batteryEfficiencyPct = 0;
  const e = energyYear(d); near(e.delivered, 0); assert.ok(Number.isFinite(e.sale)); invariant(calcAll(d));
});
test('malformed imported array members cannot escape normalization', () => {
  const d = normalizeData({ suddenExpenses: [null, { id: {}, firstYear: 'broken', amount: '100', cycleYears: 8 }],
    savingsInsurances: [false, { id: 1, payoutYear: 'bad' }], maint: { items: [0, { id: {}, cycleYears: 'bad' }] } });
  assert.equal(d.suddenExpenses[0].firstYear, 1); assert.equal(typeof d.suddenExpenses[0].id, 'string');
  assert.equal(d.savingsInsurances[0].payoutYear, 1); invariant(calcAll(d));
});
test('shortening below ten years stops credits from that year, not earlier years', () => {
  const d = fresh(); Object.assign(d.loan, { taxInclude: true, taxAnnualCap: 100, taxSpouseAnnualCap: 100,
    years: 15, varRate1: 0, varRate2: 0, varRate3: 0, pyear: 5, pamount: 1800 });
  d.housing.actualLoan = 3000;
  const c = calcAll(d); assert.equal(c.repaymentYears, 6);
  assert.ok(c.rows[0].taxBack > 0 && c.rows[3].taxBack > 0);
  near(c.rows[4].taxBack, 0); near(c.rows[5].taxBack, 0);
});
function invariant(c) {
  assert.equal(c.rows.length, 60);
  let balance = c.initialCash;
  c.rows.forEach((r, i) => {
    assert.equal(r.year, i + 1);
    for (const value of Object.values(r)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    near(r.income, r.wage + r.pension + r.retBonus + r.taxBack + r.insurancePayout);
    near(r.totalOut, r.loanPay + r.living + r.utility + r.propTax + r.eduCost + r.maintCost + r.sudden);
    near(r.net, r.income + r.solarSale - r.totalOut);
    balance += r.net; near(r.balance, balance, 1e-5);
    assert.ok(r.loanBalance >= 0 && r.utility >= 0 && r.solarSaving >= 0);
  });
}

test('all horizons reconcile without internal rounding', () => {
  for (const years of [30, 40, 50, 60]) {
    const d = fresh(); d.simYears = years;
    const c = calcAll(d); invariant(c);
    const rows = c.rows.slice(0, years);
    near(c.initialCash + sum(rows, 'income') + sum(rows, 'solarSale') - sum(rows, 'totalOut'), rows.at(-1).balance, 1e-6);
    near(c.lifeIncWage, sum(rows, 'wage')); near(c.lifeIncPension, sum(rows, 'pension'));
    near(c.totalMaint, sum(rows, 'maintCost')); near(c.totalEdu, sum(rows, 'eduCost'));
  }
});
test('zero interest, no bonus: payment and principal conservation', () => {
  const l = fresh().loan; Object.assign(l, { years: 30, varRate1: 0, varRate2: 0, varRate3: 0 });
  const c = loanSchedule(l, 3600);
  near(c.phaseMonthly[0], 10); near(c.totalPaid, 3600); near(c.totalInterest, 0);
  assert.equal(c.completionMonth, 360); near(c.annual[29].balance, 0);
});
test('fixed annuity matches independent closed form', () => {
  const l = fresh().loan; Object.assign(l, { years: 35, varRate1: 2, varRate2: 2, varRate3: 2 });
  const c = loanSchedule(l, 4500);
  near(c.phaseMonthly[0], calcMonthly(4500, 2, 35)); near(c.totalPaid - 4500, c.totalInterest);
  near(c.totalPaid, calcMonthly(4500, 2, 35) * 420, 1e-5);
});
test('rate decrease actually lowers scheduled repayment without prepayment', () => {
  const l = fresh().loan; Object.assign(l, { years: 30, varRate1: 3, varRate2: 1, varRate3: 0.5 });
  const c = loanSchedule(l, 4000);
  assert.ok(c.phaseMonthly[1] < c.phaseMonthly[0]); assert.ok(c.phaseMonthly[2] < c.phaseMonthly[1]);
  assert.equal(c.completionMonth, 360);
});
test('bonus payments are counted once and are part of annual affordability', () => {
  const d = fresh(); Object.assign(d.loan, { years: 30, varRate1: 0, varRate2: 0, varRate3: 0, bonusAmount: 12, bonusTimes: 2 });
  d.housing.actualLoan = 3600;
  const c = calcAll(d); near(c.monthly, 8); near(c.rows[0].loanPay, 120); near(c.actualTotalRepay, 3600);
  const v = buildOverview(d, c); near(v.monthlyItems[0].amount, 10);
});
test('prepayment reduces period and principal is conserved across later rates', () => {
  const d = fresh(); d.loan.pamount = 1000; d.loan.pyear = 5;
  const c = calcAll(d); assert.ok(c.repaymentYears < d.loan.years);
  near(c.rows[4].prepaid, 1000); near(c.actualTotalRepay - c.loan, c.actualTotalInt, 1e-5);
});
test('payment reduction reflects in later year payments', () => {
  const d = fresh(); Object.assign(d.loan, { ptype: '返済額軽減', pamount: 1000, pyear: 5 });
  const c = calcAll(d);
  assert.ok(c.rows[5].loanPay < c.rows[3].loanPay); assert.equal(c.repaymentYears, 35);
  near(c.actualTotalRepay - c.loan, c.actualTotalInt, 1e-5);
});
test('early full repayment stops subsequent payments and clamps to balance', () => {
  const d = fresh(); d.loan.pamount = 99999; d.loan.pyear = 1;
  const c = calcAll(d); assert.equal(c.repaymentYears, 1); near(c.rows[1].loanPay, 0);
  near(c.actualTotalRepay - c.loan, c.actualTotalInt);
});
test('invalid zero duration is flagged and never creates negative interest', () => {
  const d = fresh(); d.loan.years = 0;
  const c = calcAll(d); invariant(c); assert.ok(c.warnings.some(w => w.includes('返済期間')));
  assert.ok(c.actualTotalRepay >= c.loan); assert.ok(c.actualTotalInt >= 0);
});
test('review rate only changes qualification maximum, not actual cashflow', () => {
  const d = fresh(); const before = calcAll(d); d.housing.reviewRate = 0;
  const after = calcAll(d); near(before.rows[59].balance, after.rows[59].balance);
  assert.ok(calcMaxLoan(650, 35, 0, 35) > calcMaxLoan(650, 35, 3, 35));
  assert.ok(calcMaxLoan(650, 35, 3, 35, 5) < calcMaxLoan(650, 35, 3, 35));
});
test('equipment included, cash, and mortgage funding are not double counted', () => {
  const d = fresh(); d.solar.battEnabled = true; d.solar.battCost = 150;
  const included = calcAll(d); d.solar.funding = 'cash'; const cash = calcAll(d);
  near(cash.loan, included.loan); near(cash.initialCash, included.initialCash - 285);
  d.solar.funding = 'loan'; const loan = calcAll(d);
  near(loan.loan, included.loan + 285); near(loan.initialCash, included.initialCash);
  d.solar.enabled = false; const off = calcAll(d); near(off.solarInitial, 0); near(off.loan, included.loan);
});
test('manual mortgage funding difference comes from savings', () => {
  const d = fresh(), c = calcAll(d); d.housing.actualLoan = c.loan - 500;
  const less = calcAll(d); near(less.initialCash, c.initialCash - 500);
  d.housing.actualLoan = c.totalCost + 500; const excess = calcAll(d);
  near(excess.initialCash, c.initialSavings); assert.ok(excess.warnings.some(w => w.includes('超過借入')));
});
test('disabled spouse contributes neither savings nor salary nor retirement bonus', () => {
  const d = fresh(); d.basic.spouseSavings = 1000; d.basic.spouseRetireBonus = 500; d.basic.spouseEnabled = false;
  const c = calcAll(d); near(c.initialSavings, d.basic.savings); near(sum(c.rows, 'retBonus'), 0);
});
test('each spouse retirement bonus occurs at their own retirement year', () => {
  const d = fresh(); Object.assign(d.basic, { age: 33, retireAge: 65, retireBonus: 1000, spouseAge: 30, spouseRetireAge: 60, spouseRetireBonus: 500 });
  const c = calcAll(d); near(c.rows[29].retBonus, 500); near(c.rows[31].retBonus, 1000); near(sum(c.rows, 'retBonus'), 1500);
});
test('income classifications remain correct while only one partner is retired', () => {
  const d = fresh(); Object.assign(d.basic, { age: 65, retireAge: 65, pensionMonthly: 15, spouseAge: 45, spouseRetireAge: 65 });
  const c = calcAll(d); near(c.rows[0].pension, 180); assert.ok(c.rows[0].wage > 0);
  near(c.rows[0].income, c.rows[0].wage + c.rows[0].pension);
});
test('other debt ends after payoff even beyond retirement', () => {
  const d = fresh(); Object.assign(d.household, { otherLoanBalance: 120, otherLoan: 5, otherLoanRate: 0 });
  d.basic.age = 65;
  const c = calcAll(d); near(c.rows[0].otherLoanPay, 60); near(c.rows[1].otherLoanPay, 60); near(c.rows[2].otherLoanPay, 0);
});
test('unknown other debt balance uses explicit remaining months', () => {
  const d = fresh(); Object.assign(d.household, { otherLoanBalance: 0, otherLoan: 3, otherLoanMonths: 14 });
  const c = calcAll(d); near(c.rows[0].otherLoanPay, 36); near(c.rows[1].otherLoanPay, 6); near(c.rows[2].otherLoanPay, 0);
});
test('unknown debt term is flagged and never silently omitted', () => {
  const d = fresh(); d.household.otherLoan = 3;
  const c = calcAll(d); near(c.rows[59].otherLoanPay, 36); assert.ok(c.warnings.some(w => w.includes('残高・残り月数')));
});
test('education uses elementary costs, includes preschool, excludes elapsed years', () => {
  const d = fresh(); d.basic.c1age = 6;
  const c = calcAll(d); near(c.rows[0].eduCost, 36.6599); near(c.rows[6].eduCost, 54.245);
  d.basic.c1age = 3; near(calcAll(d).rows[0].eduCost, 18.4646);
  d.basic.c1age = 22; near(calcAll(d).totalEdu, 0);
});
test('education custom cost and future inflation are honored', () => {
  const d = fresh(); d.basic.c1age = 6; d.household.inflationRate = 2; d.educationCosts['公立小学校'] = 20;
  const c = calcAll(d); near(c.rows[0].eduCost, 20); near(c.rows[1].eduCost, 20.4);
});
test('events and maintenance include exact 30 and 60 year boundaries', () => {
  const d = fresh(); d.solar.enabled = false; d.maint.items = [{ id: 'boundary', name: 'Boundary', enabled: true, cost: 100, cycleYears: 30 }];
  d.suddenExpenses = [{ id: 'travel', name: 'Travel', amount: 10, cycleYears: 1 }];
  const c = calcAll(d); near(c.rows[29].maintCost, 100); near(c.rows[59].maintCost, 100); near(c.totalMaint, 100); near(c.lifeExpSudden, 300);
});
test('one-off and delayed periodic events respect first and last year', () => {
  const e = { id: 'e', name: 'e', amount: 100, cycleYears: 4, firstYear: 2, endYear: 10 };
  assert.deepEqual(Array.from({ length: 15 }, (_, i) => i + 1).filter(y => occursInYear(e, y)), [2, 6, 10]);
  assert.deepEqual(Array.from({ length: 15 }, (_, i) => i + 1).filter(y => occursInYear({ ...e, once: true }, y)), [2]);
});
test('insurance premium and maturity use the same year-end convention', () => {
  const d = fresh(); d.savingsInsurances = [{ id: 's', name: 's', monthly: 1, payoutYear: 30, payoutAmount: 400 }];
  const c = calcAll(d); near(c.lifeExpSiPaid, 360); near(c.rows[29].insurancePayout, 400); near(c.rows[30].insurancePremium, 0);
});
test('tax credits are excluded by default and zero for zero wage', () => {
  const d = fresh(); near(calcAll(d).taxDeductionTotal, 0);
  Object.assign(d.loan, { taxInclude: true, taxAnnualCap: 30, taxSpouseAnnualCap: 30 });
  Object.assign(d.basic, { income: 0, spouseIncome: 0, annualBonusInc: 0, spouseAnnualBonusInc: 0 });
  near(calcAll(d).taxDeductionTotal, 0);
});
test('tax credit respects personal caps and debt share including zero percent', () => {
  const d = fresh(); Object.assign(d.loan, { taxInclude: true, taxAnnualCap: 2, taxSpouseAnnualCap: 1, taxPairMainShare: 0 });
  const c = calcAll(d); near(c.taxDeductionMain, 0); assert.ok(c.rows.every(r => r.taxBack <= 1));
  assert.ok(c.taxDeductionSpouse > 0);
});
test('2028 long-term house borrowing limit uses the current supported rule', () => {
  near(getTaxBorrowLimit('long_term', 2028, true), 5000); near(getTaxBorrowLimit('long_term', 2028, false), 4500);
  near(getTaxBorrowLimit('general', 2028, true), 0); near(getTaxBorrowLimit('long_term', 2031, true), 0);
});
test('energy conservation, day-night demand caps and battery loss', () => {
  const d = fresh(); Object.assign(d.solar, { battEnabled: true, solarKw: 15, powerconKw: 15, monthlyUsage: 200 });
  const e = energyYear(d);
  for (const m of e.months) {
    near(m.generation, m.direct + m.delivered + m.loss + m.sold);
    near(m.purchased + m.direct + m.delivered, 200);
    assert.ok(m.direct <= 80 + 1e-6); assert.ok(m.delivered <= 120 + 1e-6); assert.ok(m.loss >= 0);
  }
});
test('zero consumption never produces self-consumption savings even with manual targets', () => {
  const d = fresh(); Object.assign(d.solar, { monthlyUsage: 0, selfRateManual: true, selfRateSolar: 100, selfRateBatt: 100, battEnabled: true });
  const e = energyYear(d); near(e.direct, 0); near(e.delivered, 0); near(e.saving, 0);
});
test('day and night prices are assigned to the matching energy flows', () => {
  const d = fresh(); Object.assign(d.solar, { battEnabled: true, elecPriceDay: 40, elecPriceNight: 10 });
  const e = energyYear(d); near(e.saving, (e.direct * 40 + e.delivered * 10) / 1e4);
});
test('LCC and solar manual electricity amounts and zero override affect the ledger', () => {
  const d = fresh(); d.solar.enabled = false; d.household.electricMonthly = 3;
  let c = calcAll(d); near(c.rows[0].utility, (3 + d.household.gasMonthly + d.household.waterMonthly) * 12);
  d.household.electricMonthly = 0; d.solar.elecBillManual = 0;
  c = calcAll(d); near(c.rows[0].utility, (d.household.gasMonthly + d.household.waterMonthly) * 12);
});
test('panel lifetime, replacement timing and generation degradation are consistent', () => {
  const d = fresh(); d.solar.panelReplace = false;
  assert.ok(energyYear(d, 29).generation > 0); near(energyYear(d, 30).generation, 0); near(solarMaintenance(d.solar, 30), 0);
  d.solar.panelReplace = true; assert.ok(solarMaintenance(d.solar, 30) >= d.solar.panelReplaceCost);
  near(energyYear(d, 30).generation, energyYear(d, 0).generation);
});
test('property tax changes after relief years and respects 120m2/200m2 apportionment', () => {
  const d = fresh(); const pt = calcPropertyTax(d.housing, d.loan), c = calcAll(d);
  near(c.rows[4].propTax, pt.during); near(c.rows[5].propTax, pt.after); assert.ok(pt.after > pt.during);
  d.housing.buildArea = 60; const large = calcPropertyTax(d.housing, d.loan);
  assert.ok(large.normalBuildVal > 0); near(large.reducedBuildVal + large.normalBuildVal, large.buildVal);
});

test('building and land area affect automatic tax even below the relief area caps', () => {
  const d = fresh(); Object.assign(d.housing, { buildArea: 30, landArea: 50 });
  const initial = calcPropertyTax(d.housing, d.loan);
  near(initial.buildAuto, 1140); near(initial.landAuto, 550);
  near(initial.during, 1140 * 0.00825 + 550 * 0.00275);
  d.housing.buildArea = 35;
  const building = calcPropertyTax(d.housing, d.loan);
  near(building.during - initial.during, 5 * 38 * 0.00825);
  near(building.after - initial.after, 5 * 38 * 0.01575);
  d.housing.landArea = 60;
  const land = calcPropertyTax(d.housing, d.loan);
  near(land.during - building.during, 10 * 11 * 0.00275);
  near(land.after - building.after, 10 * 11 * 0.00275);
});

test('unit values and zero area are respected without purchase-price overrides', () => {
  const d = fresh(); Object.assign(d.housing, { propTaxBuildingUnitValue: 40, propTaxLandUnitValue: 15 });
  const pt = calcPropertyTax(d.housing, d.loan); near(pt.buildAuto, 1400); near(pt.landAuto, 900);
  d.housing.building = 9999; d.housing.land = 9999;
  assert.deepEqual(calcPropertyTax(d.housing, d.loan), pt);
  d.housing.buildArea = 0; d.housing.landArea = 0;
  near(calcPropertyTax(d.housing, d.loan).during, 0);
  d.housing.buildArea = 35; d.housing.landArea = 60;
  d.housing.propTaxBuildingUnitValue = 0; d.housing.propTaxLandUnitValue = 0;
  const restored = normalizeData(d); near(calcPropertyTax(restored.housing, restored.loan).after, 0);
});

test('manual assessments stay fixed but area relief still changes', () => {
  const d = fresh(); Object.assign(d.housing, { propTaxBuildingValue: 1500, propTaxLandValue: 700, buildArea: 30, landArea: 50 });
  const pt = calcPropertyTax(d.housing, d.loan);
  Object.assign(d.housing, { buildArea: 35, landArea: 60, propTaxBuildingUnitValue: 100 });
  const small = calcPropertyTax(d.housing, d.loan);
  near(small.during, pt.during); near(small.after, pt.after);
  d.housing.buildArea = 60; const large = calcPropertyTax(d.housing, d.loan);
  near(large.buildVal, 1500); near(large.buildAfter, pt.buildAfter); assert.ok(large.buildDuring > pt.buildDuring);
  d.housing.propTaxBuildingValue = 0; near(calcPropertyTax(d.housing, d.loan).buildDuring, 0);
});

test('legacy price-based saves retain tax and become responsive to later area edits', () => {
  const d = fresh(); delete d.housing.propTaxBuildingUnitValue; delete d.housing.propTaxLandUnitValue;
  const restored = normalizeData(d); const pt = calcPropertyTax(restored.housing, restored.loan);
  near(pt.buildVal, 1350); near(pt.landVal, 700); near(pt.during, 1350 * 0.00825 + 700 * 0.00275);
  near(pt.after, 1350 * 0.01575 + 700 * 0.00275);
  restored.housing.buildArea = 36; restored.housing.landArea = 61;
  const changed = calcPropertyTax(restored.housing, restored.loan); assert.ok(changed.during > pt.during); assert.ok(changed.after > pt.after);
  assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(restored))), restored);
});

test('legacy manual, zero-price and zero-area assessments survive migration', () => {
  const d = fresh(); delete d.housing.propTaxBuildingUnitValue; delete d.housing.propTaxLandUnitValue;
  d.housing.propTaxBuildingValue = 0; d.housing.propTaxLandValue = 500;
  let restored = normalizeData(d), pt = calcPropertyTax(restored.housing, restored.loan);
  near(pt.buildVal, 0); near(pt.landVal, 500);
  Object.assign(d.housing, { propTaxBuildingValue: null, propTaxLandValue: null, building: 0, land: 0 });
  restored = normalizeData(d); pt = calcPropertyTax(restored.housing, restored.loan);
  near(pt.buildVal, 35 * 38); near(pt.landVal, 60 * 11);
  Object.assign(d.housing, { building: 3000, land: 1000, buildArea: 0, landArea: 0 });
  restored = normalizeData(d); near(restored.housing.propTaxBuildingValue, 1350); near(restored.housing.propTaxLandValue, 700);
});

test('area-based tax handles both relief caps and disabled city planning tax', () => {
  const d = fresh(); Object.assign(d.housing, { buildArea: 60, landArea: 100, cityPlanningTaxEnabled: false });
  const pt = calcPropertyTax(d.housing, d.loan);
  near(pt.buildVal, 2280); near(pt.landVal, 1100);
  near(pt.buildDuring, (pt.reducedBuildVal * 0.5 + pt.normalBuildVal) * 0.015);
  near(pt.landAnnual, (pt.smallLandVal / 6 + pt.generalLandVal / 3) * 0.015);
  near(pt.after, 2280 * 0.015 + pt.landAnnual);
});

test('area edits reconcile annual ledger, all horizons, housing display and proposal', () => {
  const d = fresh(), before = calcAll(d), oldTax = calcPropertyTax(d.housing, d.loan);
  d.housing.buildArea = 45; d.housing.landArea = 80;
  const after = calcAll(d), pt = calcPropertyTax(d.housing, d.loan);
  for (const year of [30, 40, 50, 60]) {
    const taxIncrease = (pt.during - oldTax.during) * 5 + (pt.after - oldTax.after) * (year - 5);
    near(before.rows[year - 1].balance - after.rows[year - 1].balance, taxIncrease);
  }
  const housing = renderToStaticMarkup(createElement(HousingPlan, { data: d, calc: after, update: () => {} }));
  const proposal = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: after }));
  assert.ok(housing.includes(pt.during.toFixed(2))); assert.ok(proposal.includes(pt.during.toFixed(2)));
  assert.ok(housing.includes(pt.after.toFixed(2))); assert.ok(proposal.includes(pt.after.toFixed(2)));
  near(buildOverview(d, after).monthlyItems.find(item => item.label === '固定資産税等の積立').amount, pt.during / 12);
  invariant(after);
});
test('overview reconciles monthly reserves without spending them twice', () => {
  const d = fresh(); d.suddenExpenses = [{ id: 't', name: '旅行', amount: 24, cycleYears: 1 }];
  const c = calcAll(d), v = buildOverview(d, c);
  near(v.monthlySurplus, v.regularIncome - v.monthlyItems.reduce((a, i) => a + i.amount, 0));
  near(c.rows[0].sudden, 24); invariant(c);
});
test('old saves retain inputs, numeric zero and unknown-term warning without NaN', () => {
  const old = { basic: { income: 700, pensionMonthly: 0 }, housing: { reviewRate: 0 }, household: { otherLoan: 2 }, suddenExpenses: [{ id: 'old', name: 'Car', amount: 300, cycleYears: 8 }] };
  const d = normalizeData(old); near(d.basic.income, 700); near(d.basic.pensionMonthly, 0); near(d.housing.reviewRate, 0);
  assert.equal(d.suddenExpenses[0].firstYear, 8); assert.equal(d.loan.taxInclude, false); invariant(calcAll(d));
});
test('stress settings do not mutate original customer data', () => {
  const d = fresh(), before = JSON.stringify(d), changed = makeStressData(d);
  assert.equal(JSON.stringify(d), before); assert.ok(changed.basic.income < d.basic.income);
  assert.ok(changed.loan.varRate1 > d.loan.varRate1); assert.ok(changed.household.food > d.household.food);
});

test('life-stage expense totals reconcile to the unmodified sixty-year ledger', () => {
  const d = fresh(); d.household.inflationRate = 2;
  d.household.otherLoan = 2; d.household.otherLoanBalance = 100;
  d.savingsInsurances = [{ id: 's', name: 's', monthly: 1, payoutYear: 35, payoutAmount: 400 }];
  d.suddenExpenses = [{ id: 'car', name: 'car', amount: 250, cycleYears: 8 }];
  const c = calcAll(d), original = JSON.stringify(c), stages = buildLifeStageExpenses(d, c);
  assert.equal(stages.working.years, 32); assert.equal(stages.retired.years, 28);
  near(stages.working.total + stages.retired.total, sum(c.rows, 'totalOut'));
  for (const stage of [stages.working, stages.retired]) {
    near(stage.amounts.reduce((a, v) => a + v, 0), stage.monthlyTotal);
    near(stage.monthlyTotal * stage.years * 12, stage.total);
  }
  assert.equal(JSON.stringify(c), original);
  d.simYears = 60; assert.deepEqual(buildLifeStageExpenses(d, calcAll(d)), stages);
});

test('life-stage boundary follows start-of-year age, not year-end display age', () => {
  const d = fresh(); Object.assign(d.basic, { age: 64, retireAge: 65 });
  const c = calcAll(d), s = buildLifeStageExpenses(d, c);
  assert.equal(s.working.years, 1); assert.equal(s.working.startAge, 64); assert.equal(s.working.endAge, 64);
  assert.equal(s.retired.startAge, 65); assert.equal(s.retired.firstYear, 2);
  near(s.working.total, c.rows[0].totalOut); near(s.retired.total, sum(c.rows.slice(1), 'totalOut'));
});

test('life-stage absent periods remain absent, never fabricated zero-cost stages', () => {
  const d = fresh(); d.basic.age = 70;
  let s = buildLifeStageExpenses(d, calcAll(d)); assert.equal(s.working, null); assert.equal(s.retired.years, 60);
  Object.assign(d.basic, { age: 20, retireAge: 80 });
  s = buildLifeStageExpenses(d, calcAll(d)); assert.equal(s.retired, null); assert.equal(s.working.years, 60);
  const html = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: calcAll(d) }));
  assert.ok(html.includes('対象期間なし')); assert.ok(!html.includes('NaN'));
});

test('life-stage categories avoid double counting insurance and other loans', () => {
  const d = fresh(); d.household.otherLoan = 2; d.household.otherLoanMonths = 12;
  d.savingsInsurances = [{ id: 's', name: 's', monthly: 3, payoutYear: 1, payoutAmount: 36 }];
  Object.assign(d.basic, { age: 64, retireAge: 65 });
  const c = calcAll(d), s = buildLifeStageExpenses(d, c);
  near(s.working.amounts[1], (c.rows[0].living - 24 - 36) / 12);
  near(s.working.amounts[2], 2); near(s.working.amounts[3], 3);
  near(s.retired.amounts[2], 0); near(s.retired.amounts[3], 0);
});

test('summary and proposal show only base results while retaining negative balances', () => {
  const d = fresh(); d.household.food = 100;
  const c = calcAll(d); assert.ok(c.rows[29].balance < 0);
  const props = { data: d, calc: c, onPrint: () => {}, onExport: () => {} };
  for (const component of [Summary, PrintProposal]) {
    const html = renderToStaticMarkup(createElement(component, props));
    for (const removed of ['条件悪化', '比較設定', 'お客様と確認する前提', '前提の確認状況', '前提未確認', '年末残高はプラスです', '資金計画の見直しが必要です'])
      assert.ok(!html.includes(removed), removed);
    assert.ok(html.includes('現役中・退職後の支出'));
    assert.ok(html.includes(c.rows[29].balance.toLocaleString('ja-JP', { maximumFractionDigits: 0 })));
    assert.ok(html.includes('class="negative"'));
    assert.equal((html.match(/stroke-dasharray/g) || []).length, 0);
  }
});

test('legacy comparison settings and review checkboxes do not affect the new overview', () => {
  const d = fresh(), c = calcAll(d), before = buildOverview(d, c);
  Object.assign(d.stress, { rateAdd: 8, incomeDropPct: 99, expenseAddPct: 100 });
  Object.keys(d.reviewChecks).forEach(key => { d.reviewChecks[key] = true; });
  assert.deepEqual(buildOverview(d, calcAll(d)), before);
  near(calcAll(d).rows[59].balance, c.rows[59].balance);
});
test('deterministic varied scenarios preserve all accounting identities', () => {
  let seed = 19790212;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 120; i++) {
    const d = fresh(); d.basic.income = random() * 1200; d.basic.spouseEnabled = random() > 0.3;
    d.basic.spouseAge = 25 + Math.floor(random() * 40); d.household.inflationRate = random() * 4;
    d.loan.years = 10 + Math.floor(random() * 41); d.loan.varRate1 = random() * 5; d.loan.varRate2 = random() * 5; d.loan.varRate3 = random() * 5;
    d.loan.bonusAmount = random() * 20; d.loan.pamount = random() * 700; d.solar.battEnabled = random() > 0.5;
    d.solar.monthlyUsage = random() * 1000; d.solar.funding = ['included', 'cash', 'loan'][i % 3];
    const c = calcAll(d); invariant(c); near(c.actualTotalRepay - c.loan, c.actualTotalInt, 1e-4);
  }
});
