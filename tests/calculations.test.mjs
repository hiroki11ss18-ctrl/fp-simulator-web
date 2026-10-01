import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ configFile: false, envDir: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(async () => { await server.close(); });
const { calcAll, calcMonthly, calcMaxLoan, calcPropertyTax, getTaxBorrowLimit } = await server.ssrLoadModule('/src/hooks/useCalculations.ts');
const { DEFAULT_DATA } = await server.ssrLoadModule('/src/lib/defaults.ts');
const { loanSchedule } = await server.ssrLoadModule('/src/lib/loans.ts');
const { normalizeData } = await server.ssrLoadModule('/src/lib/data.ts');
const { buildOverview, buildLifeStageExpenses, buildExpenseTotals, makeStressData } = await server.ssrLoadModule('/src/lib/planning.ts');
const { occursInYear, expenseCategory } = await server.ssrLoadModule('/src/lib/suddenExpenses.ts');
const { default: PrintProposal } = await server.ssrLoadModule('/src/components/PrintProposal.tsx');
const { default: HousingPlan } = await server.ssrLoadModule('/src/components/tabs/HousingPlan.tsx');
const { default: Summary, csvFor } = await server.ssrLoadModule('/src/components/tabs/Summary.tsx');
const { default: Lcc } = await server.ssrLoadModule('/src/components/tabs/Lcc.tsx');
const { default: Maintenance } = await server.ssrLoadModule('/src/components/tabs/Maintenance.tsx');
const { TABS } = await server.ssrLoadModule('/src/components/Header.tsx');
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

test('legacy automatic bill migrates before discounts, without changing purchase or other inputs', () => {
  const d = fresh(); delete d.household.utilityInputVersion;
  d.household.electricMonthly = 0; d.housing.actualLoan = 5000;
  d.solar = { monthlyUsage: 500, dayUsageRatio: 25, elecPriceDay: 40, elecPriceNight: 20, baseChargeMonthly: 0.1, elecBillManual: null };
  const original = JSON.stringify(d), restored = normalizeData(d);
  near(restored.household.electricMonthly, 1.35);
  assert.ok(!('solar' in restored)); assert.equal(restored.household.utilityInputVersion, 1);
  for (const key of ['basic', 'housing', 'loan', 'maint', 'suddenExpenses', 'savingsInsurances']) assert.deepEqual(restored[key], d[key]);
  assert.equal(JSON.stringify(d), original);
  assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(restored))), restored);
  invariant(calcAll(restored));
});
test('legacy manual bill priority preserves positive household bills and explicit zero solar bills', () => {
  const d = fresh(); delete d.household.utilityInputVersion;
  d.household.electricMonthly = 3; d.solar = { elecBillManual: 1.8 };
  near(normalizeData(d).household.electricMonthly, 3);
  d.household.electricMonthly = 0; near(normalizeData(d).household.electricMonthly, 1.8);
  d.solar.elecBillManual = 0;
  const restored = normalizeData(d); near(restored.household.electricMonthly, 0);
  near(normalizeData(JSON.parse(JSON.stringify(restored))).household.electricMonthly, 0);
});
test('partial and malformed legacy energy inputs use finite defaults; modern zero stays zero', () => {
  const d = fresh(); delete d.household.utilityInputVersion;
  d.household.electricMonthly = 0; d.solar = { monthlyUsage: 'bad', elecBillManual: 'bad', dayUsageRatio: -20, elecPriceDay: NaN };
  near(normalizeData(d).household.electricMonthly, 1.104);
  d.household.utilityInputVersion = 1;
  near(normalizeData(d).household.electricMonthly, 0);
  delete d.solar; delete d.household.utilityInputVersion;
  near(normalizeData(d).household.electricMonthly, 0);
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
    near(r.sudden, r.plannedCosts.travel + r.plannedCosts.car + r.plannedCosts.other);
    assert.ok(r.carRunningCost >= 0 && r.carRunningCost <= r.living + 1e-6);
    near(r.net, r.income - r.totalOut);
    balance += r.net; near(r.balance, balance, 1e-5);
    assert.ok(r.loanBalance >= 0 && r.utility >= 0);
  });
}

test('all horizons reconcile without internal rounding', () => {
  for (const years of [30, 40, 50, 60]) {
    const d = fresh(); d.simYears = years;
    const c = calcAll(d); invariant(c);
    const rows = c.rows.slice(0, years);
    near(c.initialCash + sum(rows, 'income') - sum(rows, 'totalOut'), rows.at(-1).balance, 1e-6);
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
test('legacy equipment settings never affect FP costs, borrowing, income, utility or maintenance', () => {
  const d = fresh(); d.maint.items = [];
  const before = calcAll(d);
  near(before.totalCost, 4610); near(before.loan, 4310); near(before.cashRequired, 300);
  for (const funding of ['included', 'cash', 'loan']) {
    d.solar = { enabled: true, funding, solarKw: 20, solarCost: 1000, battEnabled: true, battCost: 800,
      fitRate: 999, elecBillManual: 90, panelReplace: true, panelLifeYears: 1, panelReplaceCost: 500,
      powerconCycle: 1, powerconCost: 500, battReplaceCycle: 1, battReplaceCost: 500, solarMaintCycle: 1, solarMaintCost: 500 };
    assert.deepEqual(calcAll(d), before); assert.deepEqual(calcAll(normalizeData(d)), before);
  }
  assert.ok(before.rows.every(r => r.maintCost === 0 && !('solarSale' in r) && !('solarSaving' in r)));
  assert.ok(!('solarInitial' in before) && !('totalSolar' in before));
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
  const d = fresh(); d.maint.items = [{ id: 'boundary', name: 'Boundary', enabled: true, cost: 100, cycleYears: 30 }];
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
test('ordinary utility bills accept zero independently and add each bill exactly once', () => {
  const d = fresh(); Object.assign(d.household, { electricMonthly: 2, gasMonthly: 0.6, waterMonthly: 0.4, retUtility: 0 });
  near(calcAll(d).rows[0].utility, 36);
  d.household.electricMonthly = 0; near(calcAll(d).rows[0].utility, 12);
  d.household.gasMonthly = 0; near(calcAll(d).rows[0].utility, 4.8);
  d.household.waterMonthly = 0; assert.ok(calcAll(d).rows.every(r => r.utility === 0));
});
test('retirement utility switches at start-of-year age and uses cumulative inflation', () => {
  const d = fresh(); Object.assign(d.basic, { age: 64, retireAge: 65 });
  Object.assign(d.household, { electricMonthly: 2, gasMonthly: 0.6, waterMonthly: 0.4, retUtility: 2.5, inflationRate: 2 });
  const c = calcAll(d); near(c.rows[0].utility, 36); near(c.rows[1].utility, 30 * 1.02); near(c.rows[59].utility, 30 * 1.02 ** 59);
  d.household.retUtility = 0; near(calcAll(d).rows[1].utility, 36 * 1.02);
  d.basic.age = 65; d.household.retUtility = 2.5; near(calcAll(d).rows[0].utility, 30);
});
test('bill changes reconcile every horizon and monthly and life-stage totals without adding income', () => {
  const d = fresh(); d.household.retUtility = 0; const before = calcAll(d);
  d.household.electricMonthly += 1; const after = calcAll(d);
  for (const years of [30, 40, 50, 60]) {
    near(before.rows[years - 1].balance - after.rows[years - 1].balance, years * 12);
    near(sum(before.rows.slice(0, years), 'income'), sum(after.rows.slice(0, years), 'income'));
  }
  near(buildOverview(d, before).monthlySurplus - buildOverview(d, after).monthlySurplus, 1);
  const stagesBefore = buildLifeStageExpenses(d, before), stagesAfter = buildLifeStageExpenses(d, after);
  near(stagesAfter.working.monthlyTotal - stagesBefore.working.monthlyTotal, 1);
  near(stagesAfter.retired.monthlyTotal - stagesBefore.retired.monthlyTotal, 1);
});
test('all affected views and navigation omit solar and display ordinary utility bills', () => {
  const d = fresh(), c = calcAll(d);
  assert.equal(TABS.length, 6); assert.ok(!TABS.some(t => t.id === 'solar'));
  for (const component of [Summary, PrintProposal, Lcc, Maintenance, HousingPlan]) {
    const html = renderToStaticMarkup(createElement(component, { data: d, calc: c, update: () => {}, onPrint: () => {}, onExport: () => {} }));
    for (const word of ['太陽光', '蓄電池', '節電', '売電', 'FIT', 'パワコン']) assert.ok(!html.includes(word), word);
  }
  const html = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: c }));
  assert.ok(html.includes('光熱費')); assert.ok(html.includes('電気・ガス／灯油・水道'));
});
test('CSV has aligned purchase and annual rows and no hidden solar columns', () => {
  const c = calcAll(fresh()), csv = csvFor(c), rows = csv.slice(1).split('\r\n').map(line => line.split(','));
  assert.equal(rows.length, 62); assert.ok(rows.every(row => row.length === 19));
  const header = rows[0].map(v => v.slice(1, -1));
  assert.ok(!/売電|節電|太陽光/.test(csv));
  near(Number(rows[1][header.indexOf('年末手元資金')]), c.initialCash);
  near(Number(rows[1][header.indexOf('住宅ローン残高')]), c.loan);
  near(Number(rows[2][header.indexOf('光熱費（電気・ガス・水道）')]), c.rows[0].utility, 0.005);
  near(Number(rows[61][header.indexOf('年末手元資金')]), c.rows[59].balance, 0.005);
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
  assert.ok(housing.includes(pt.during.toFixed(2))); assert.ok(housing.includes(pt.after.toFixed(2)));
  assert.ok(proposal.includes(after.totalPropTax.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
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
  const html = renderToStaticMarkup(createElement(Summary, { data: d, calc: calcAll(d), onPrint: () => {}, onExport: () => {} }));
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
    assert.ok(html.includes(component === Summary ? '現役中・退職後の支出' : '30年間の支出総額・内訳'));
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
test('proposal has five ordered sections, replacing only the four unwanted pages', () => {
  for (const years of [30, 40, 50, 60]) {
    const d = fresh(); d.simYears = years;
    const html = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: calcAll(d) }));
    const pages = [...html.matchAll(/<section class="proposal-page[^\"]*">([\s\S]*?)<\/section>/g)].map(m => m[1]);
    assert.equal(pages.length, 5);
    assert.ok(pages[0].includes('ライフプラン提案書')); assert.ok(pages[0].includes('30・40・50・60年後の見通し'));
    assert.ok(pages[1].includes(`${years}年間の支出総額・内訳`));
    assert.ok(pages[2].includes('年次収支 / 1〜20年後'));
    assert.ok(pages[3].includes('年次収支 / 21〜40年後'));
    assert.ok(pages[4].includes('年次収支 / 41〜60年後'));
    for (const removed of ['購入後1年目の月額予算', '現役中・退職後の支出', '試算に採用した前提', '予定支出と計算上の注記']) assert.ok(!html.includes(removed), removed);
    assert.equal((html.match(/<th>\d+年 \/ \d+歳<\/th>/g) || []).length, 60);
  }
});

test('expense totals match the ledger and initial cash without changing data or counting payments twice', () => {
  for (const years of [30, 40, 50, 60]) {
    const d = fresh(); d.simYears = years; d.household.inflationRate = 2;
    d.household.otherLoan = 2; d.household.otherLoanBalance = 100;
    d.household.ins4 = 0.4; d.household.retIns2 = 0.2;
    d.savingsInsurances = [{ id: 's', name: 's', monthly: 1, payoutYear: 35, payoutAmount: 450 }];
    d.suddenExpenses = [
      { id: 't', name: '家族旅行', amount: 20, cycleYears: 1 },
      { id: 'c', name: '車の買い替え', amount: 250, cycleYears: 8 },
      { id: 'o', name: 'その他', amount: 150, cycleYears: 10 },
    ];
    const calc = calcAll(d), original = JSON.stringify({ d, calc }), totals = buildExpenseTotals(d, calc), rows = calc.rows.slice(0, years);
    near(totals.items.reduce((a, item) => a + item.amount, 0), sum(rows, 'totalOut'));
    near(totals.grandTotal, totals.periodTotal + calc.cashRequired);
    near(totals.grandTotal, calc.lccGrand);
    near(calc.initialSavings + sum(rows, 'income') - totals.grandTotal, rows.at(-1).balance);
    near(totals.items.find(i => i.key === 'insurance').amount, calc.lifeExpSiPaid);
    near(totals.items.find(i => i.key === 'otherLoan').amount, sum(rows, 'otherLoanPay'));
    assert.equal(JSON.stringify({ d, calc }), original); assert.ok(totals.items.every(i => i.amount >= 0));
  }
});

test('fifty and sixty year totals include only events within the selected period', () => {
  const d = fresh(); Object.assign(d.household, { car: 0, retCar: 0, ins4: 0, retIns2: 0 });
  d.suddenExpenses = [
    { id: 't', name: '家族旅行', amount: 20, cycleYears: 1 },
    { id: 'c', name: '車の買い替え', amount: 250, cycleYears: 8 },
    { id: 'o', name: '記念支出', amount: 100, cycleYears: 1, firstYear: 51, once: true },
  ];
  const get = (years) => { d.simYears = years; return Object.fromEntries(buildExpenseTotals(d, calcAll(d)).items.map(i => [i.key, i.amount])); };
  const fifty = get(50), sixty = get(60);
  near(fifty.travel, 1000); near(sixty.travel, 1200);
  near(fifty.car, 1500); near(sixty.car, 1750);
  near(fifty.other, 0); near(sixty.other, 100);
});

test('car totals extract running costs and insurance at retirement and inflate purchases once', () => {
  const d = fresh(); Object.assign(d.basic, { age: 64, retireAge: 65 });
  Object.assign(d.household, { car: 3, ins4: 0.4, retCar: 1, retIns2: 0.2, inflationRate: 2 });
  d.suddenExpenses = [{ id: 'c', name: 'ミニバン', category: 'car', amount: 300, cycleYears: 1, firstYear: 2, once: true }];
  const c = calcAll(d), totals = buildExpenseTotals(d, c);
  near(c.rows[0].carRunningCost, 40.8); near(c.rows[1].carRunningCost, 14.4 * 1.02);
  near(c.rows[1].plannedCosts.car, 306); near(c.rows[2].plannedCosts.car, 0);
  const expected = 40.8 + Array.from({ length: 29 }, (_, i) => 14.4 * 1.02 ** (i + 1)).reduce((a, v) => a + v, 0) + 306;
  near(totals.items.find(i => i.key === 'car').amount, expected);
  near(totals.items.reduce((a, i) => a + i.amount, 0), totals.periodTotal);
});

test('planned expense classification migrates older names and preserves explicit overrides', () => {
  const d = fresh(); d.suddenExpenses = [
    { id: 't', name: '家族旅行', amount: 20, cycleYears: 1 },
    { id: 'c', name: '車の買い替え', amount: 250, cycleYears: 8 },
    { id: 'o', name: '家具', amount: 50, cycleYears: 10 },
    { id: 'custom', name: '旅行の準備', category: 'other', amount: 10, cycleYears: 1 },
    { id: 'invalid', name: '旅費', category: 'broken', amount: 10, cycleYears: 1 },
  ];
  const restored = normalizeData(d);
  assert.deepEqual(restored.suddenExpenses.map(e => e.category), ['travel', 'car', 'other', 'other', 'travel']);
  restored.suddenExpenses[0].name = '帰省'; assert.equal(expenseCategory(restored.suddenExpenses[0]), 'travel');
  assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(restored))), restored);
  const before = calcAll(restored);
  restored.suddenExpenses[0].category = 'other'; const after = calcAll(restored);
  before.rows.forEach((r, i) => { near(r.totalOut, after.rows[i].totalOut); near(r.balance, after.rows[i].balance); });
  near(before.rows[0].plannedCosts.travel - after.rows[0].plannedCosts.travel, 20);
  near(after.rows[0].plannedCosts.other - before.rows[0].plannedCosts.other, 20);
});

test('zero budgets and unusual retirement boundaries do not create missing totals or NaN', () => {
  for (const age of [20, 70]) {
    const d = fresh(); d.basic.age = age; d.basic.retireAge = age === 20 ? 90 : 65;
    Object.keys(d.household).forEach(key => { if (key !== 'utilityInputVersion') d.household[key] = 0; });
    const c = calcAll(d), totals = buildExpenseTotals(d, c);
    for (const key of ['living', 'utility', 'travel', 'car', 'insurance', 'otherLoan', 'other']) near(totals.items.find(i => i.key === key).amount, 0);
    near(totals.items.reduce((a, i) => a + i.amount, 0), totals.periodTotal);
    const html = renderToStaticMarkup(createElement(PrintProposal, { data: d, calc: c })); assert.ok(!/NaN|undefined|Infinity/.test(html));
  }
});

test('deterministic varied scenarios preserve all accounting identities', () => {
  let seed = 19790212;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 120; i++) {
    const d = fresh(); d.basic.income = random() * 1200; d.basic.spouseEnabled = random() > 0.3;
    d.basic.spouseAge = 25 + Math.floor(random() * 40); d.household.inflationRate = random() * 4;
    d.loan.years = 10 + Math.floor(random() * 41); d.loan.varRate1 = random() * 5; d.loan.varRate2 = random() * 5; d.loan.varRate3 = random() * 5;
    d.loan.bonusAmount = random() * 20; d.loan.pamount = random() * 700;
    d.household.electricMonthly = random() * 5; d.household.gasMonthly = random() * 2;
    d.household.waterMonthly = random(); d.household.retUtility = i % 3 === 0 ? 0 : random() * 5;
    const c = calcAll(d); invariant(c); near(c.actualTotalRepay - c.loan, c.actualTotalInt, 1e-4);
  }
});
