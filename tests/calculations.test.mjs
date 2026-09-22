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
const { buildOverview, makeStressData } = await server.ssrLoadModule('/src/lib/planning.ts');
const { occursInYear } = await server.ssrLoadModule('/src/lib/suddenExpenses.ts');
const { default: PrintProposal } = await server.ssrLoadModule('/src/components/PrintProposal.tsx');
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
