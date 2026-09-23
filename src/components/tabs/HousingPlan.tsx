import { Card, Field, NumInput, Select, Section } from '../ui';
import type { SimData, CalcResult } from '../../types';
import {
  calcPropertyTax,
  calcMaxLoan,
  lookupManualSalary,
} from '../../hooks/useCalculations';
import { fmtMan, fmt } from '../../lib/format';

export default function HousingPlan({ data, update, calc: _calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const h = data.housing;
  const b = data.basic;
  const l = data.loan;
  const hh = data.household;
  const set = (patch: Partial<SimData['housing']>) => update({ housing: { ...h, ...patch } });
  const setLoan = (patch: Partial<SimData['loan']>) => update({ loan: { ...l, ...patch } });
  const setHH = (patch: Partial<SimData['household']>) => update({ household: { ...hh, ...patch } });

  // 諸費用・総費用・借入予定額（総費用−頭金）
  const miscAmt = _calc.miscAmt;
  const totalCost = _calc.totalCost;
  const netLoan = _calc.loanAuto;

  // 審査基準（単独・ペアローン共通）
  const reviewRate = h.reviewRate ?? 3;
  const reviewRatio = h.repRatio;
  const ratioOptions = [...new Set([20, 25, 30, 35, 40, reviewRatio])]
    .sort((a, b) => a - b)
    .map(value => ({ value, label: `${value}%` }));

  // 世帯年収（参考表示用・ボーナス込み）
  const mainAnnual = b.age >= b.retireAge ? 0 : (b.salaryAuto ? b.income : lookupManualSalary(b.salaryManual, b.age)) + b.annualBonusInc;
  const spouseAnnual = !b.spouseEnabled || b.spouseAge >= b.spouseRetireAge ? 0 : (b.salSpouseAuto ? b.spouseIncome : lookupManualSalary(b.spouseSalaryManual, b.spouseAge)) + b.spouseAnnualBonusInc;
  const householdAnnual = mainAnnual + spouseAnnual;
  // 借入審査に使う年収（単独=世帯主のみ / ペアローン=世帯合算）
  const isPair = b.loanBorrowType === 'pair' && b.spouseEnabled;
  const loanIncome = isPair ? householdAnnual : mainAnnual;

  // 他ローンの年返済（最大借入額からこの分を差し引く）
  const otherLoanAnnual = hh.otherLoan * 12;
  const annualBudget = loanIncome * reviewRatio / 100;            // 全ローン枠
  const annualForHousing = Math.max(0, annualBudget - otherLoanAnnual); // 住宅ローン用
  const maxLoan = calcMaxLoan(loanIncome, reviewRatio, reviewRate, l.years, hh.otherLoan);
  // 他ローンがない場合の最大借入額（比較用）
  const maxLoanNoOther = calcMaxLoan(loanIncome, reviewRatio, reviewRate, l.years, 0);
  const reducedBy = Math.max(0, maxLoanNoOther - maxLoan);

  const pt = calcPropertyTax(h, l);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左列：入力 */}
        <div className="space-y-4">
          <Card title="費用入力">
            <div className="grid grid-cols-2 gap-4">
              <Field label="🟫 土地代"><NumInput value={h.land} onChange={v => set({ land: v })} suffix="万円" /></Field>
              <Field label="🏠 建物代（本体工事）"><NumInput value={h.building} onChange={v => set({ building: v })} suffix="万円" /></Field>
              <Field label="🔧 付帯工事費"><NumInput value={h.fuka} onChange={v => set({ fuka: v })} suffix="万円" /></Field>
              <Field label="🌳 外構工事費"><NumInput value={h.exterior} onChange={v => set({ exterior: v })} suffix="万円" /></Field>
            </div>
            <div className="h-4" />
            <Section title="諸費用">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mt-2">
                <Field label="計算方法">
                  <div className="flex rounded-[8px] border border-line-card overflow-hidden">
                    <button
                      type="button"
                      className={`px-3 py-2 text-sm flex-1 transition-colors ${h.miscMode === 'pct' ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
                      onClick={() => set({ miscMode: 'pct' })}
                    >% で算出</button>
                    <button
                      type="button"
                      className={`px-3 py-2 text-sm flex-1 transition-colors ${h.miscMode === '100' ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
                      onClick={() => set({ miscMode: '100' })}
                    >本体同額</button>
                  </div>
                </Field>
                {h.miscMode === 'pct' && (
                  <Field label="諸費用率">
                    <NumInput value={h.miscPct} onChange={v => set({ miscPct: v })} step={0.5} suffix="%" />
                  </Field>
                )}
              </div>
            </Section>
          </Card>

          <Card title="資金計画">
            <div className="grid grid-cols-2 gap-4">
              <Field label="💰 頭金（自己資金）"><NumInput value={h.down} onChange={v => set({ down: v })} suffix="万円" /></Field>
              <Field label="📅 返済期間"><NumInput value={l.years} onChange={v => setLoan({ years: Math.round(v) })} suffix="年" min={1} max={60} step={1} /></Field>
            </div>
            <p className="text-xs text-ink-sub mt-3">※ 実借入額の調整は「ローン計画」シートで行います。</p>
          </Card>

          <Card title="💳 住宅ローン以外の借入" accent="orange">
            <p className="text-xs text-ink-sub mb-3">
              自動車ローン・カードローン・教育ローン等の月返済は、銀行審査の返済負担率に算入されるため、住宅ローンの最大借入額が下がります。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="他ローン残高" hint="例) 車ローン 100〜200万円程度">
                <NumInput value={hh.otherLoanBalance} onChange={v => setHH({ otherLoanBalance: v })} suffix="万円" />
              </Field>
              <Field label="月々の他ローン支払い" hint="例) 車ローン 月3〜5万円程度">
                <NumInput value={hh.otherLoan} onChange={v => setHH({ otherLoan: v })} step={0.5} suffix="万円/月" />
              </Field>
            </div>
          </Card>
        </div>

        {/* 右列：サマリー */}
        <div className="space-y-4">
          <Card title="📋 費用サマリー">
            <div className="space-y-2 text-sm">
              <Row label="🟫 土地代" value={fmtMan(h.land)} />
              <Row label="🏠 建物代（本体工事）" value={fmtMan(h.building)} />
              <Row label="🔧 付帯工事費" value={fmtMan(h.fuka)} />
              <Row label="🌳 外構工事費" value={fmtMan(h.exterior)} />
              <Row label="💼 諸費用" value={fmtMan(miscAmt)} />
              <div className="border-t-2 border-line-card my-2" />

              {/* 総費用（主役表示） */}
              <div className="bg-accent-blue/10 rounded-[8px] p-4">
                <div className="text-xs text-ink-label mb-1">総費用</div>
                <div className="text-3xl font-bold tabular text-accent-blue">
                  {fmtMan(totalCost)} <span className="text-base font-normal text-ink-sub">万円</span>
                </div>
                <div className="text-[11px] text-ink-sub mt-1">
                  土地・建物・付帯・外構・諸費用・別途設備費の合計
                </div>
              </div>

              {/* 頭金と借入予定額 */}
              <div className="pt-1 space-y-1">
                <Row label="▲ 頭金（自己資金）" value={`-${fmtMan(h.down)}`} negative />
              </div>
              <div className="bg-status-ok/8 border border-status-ok/30 rounded-[8px] p-3 mt-2">
                <div className="text-[11px] text-ink-label mb-0.5">借入予定額（現金払い設備を除く費用 − 頭金）</div>
                <div className="text-2xl font-bold tabular text-status-ok">
                  {fmtMan(netLoan)} <span className="text-sm font-normal text-ink-sub">万円</span>
                </div>
                {h.down > 0 && (
                  <div className="text-[11px] text-ink-sub mt-1">
                    実借入 {_calc.loan.toLocaleString()}万円 / 現金支出 {fmtMan(_calc.cashRequired)}万円 / 購入直後残高 {fmtMan(_calc.initialCash)}万円
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="🎯 最大借入額（年収基準）">
            <div className="bg-bg-panel rounded-[10px] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${isPair ? 'bg-accent-blue/15 text-accent-blue' : 'bg-status-warn/15 text-status-warn'}`}>
                  {isPair ? '👫 ペアローン' : '🧑 単独'}
                </span>
                <span className="text-xs text-ink-sub">対象年収 {fmtMan(loanIncome)} 万円</span>
              </div>
              <div className="text-4xl font-bold tabular text-ink-main">
                {fmtMan(maxLoan)} <span className="text-base font-normal text-ink-sub">万円</span>
              </div>
              <div className="text-[11px] text-ink-sub mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="inline-flex items-center gap-2">
                  <span>審査金利</span>
                  <NumInput
                    value={reviewRate}
                    onChange={v => set({ reviewRate: v })}
                    step={0.1}
                    min={0}
                    max={100}
                    suffix="%"
                    className="w-32 tabular font-semibold"
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <span>返済比率</span>
                  <Select<number>
                    value={reviewRatio}
                    onChange={v => set({ repRatio: v })}
                    options={ratioOptions}
                    className="!w-24 tabular font-semibold"
                  />
                </label>
                <span>📅 返済期間 <span className="tabular font-semibold text-ink-main">{l.years}年</span></span>
              </div>
            </div>

            <p className="plan-note">年収・審査金利・比率から逆算した目安で、融資承認や返済の安全性を保証するものではありません。実際の返済金利はローン計画で別に設定します。</p>
            {/* 他ローン控除の内訳 */}
            {hh.otherLoan > 0 && (
              <div className="mt-3 text-xs space-y-1 bg-bg-card border border-line-table rounded-[8px] p-3">
                <div className="font-bold text-ink-sub mb-1.5">📋 返済負担率{reviewRatio}%枠の内訳</div>
                <div className="flex justify-between">
                  <span className="text-ink-sub">全ローン年返済枠</span>
                  <span className="tabular text-ink-main">{fmt(annualBudget, 1)} 万円</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-sub">− 他ローン年返済</span>
                  <span className="tabular text-status-danger">-{fmt(otherLoanAnnual, 1)} 万円</span>
                </div>
                <div className="flex justify-between border-t border-line-table pt-1 mt-1 font-semibold">
                  <span className="text-ink-main">住宅ローン用枠</span>
                  <span className="tabular text-status-ok">{fmt(annualForHousing, 1)} 万円</span>
                </div>
                <div className="text-[10px] text-ink-sub mt-1">
                  他ローンなしの場合は <span className="tabular">{fmtMan(maxLoanNoOther)}</span>万 → 現状 <span className="tabular">{fmtMan(maxLoan)}</span>万 （<span className="tabular text-status-danger">-{fmtMan(reducedBy)}</span>万）
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="🏛 固定資産税（評価額設定）">
        <p className="text-xs text-ink-sub mb-4">
          自動評価額は「面積 × 評価単価」の概算です。単価は建築費の坪単価ではなく、固定資産税用の仮評価額です。
        </p>

        {/* 面積入力 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="space-y-3">
            <Field label="建物の延床面積（各階の合計）">
              <NumInput value={h.buildArea} onChange={v => set({ buildArea: v })} suffix="坪" step={0.5} />
            </Field>
            <Field label="建物の評価単価（仮定）">
              <NumInput value={Number(h.propTaxBuildingUnitValue.toFixed(4))} onChange={v => set({ propTaxBuildingUnitValue: v })} suffix="万円/坪" step={0.1} />
            </Field>
            <div className="text-[11px] text-ink-sub mt-2">
              延床面積 {fmt(pt.buildAreaM2, 2)}㎡。新築軽減は住宅部分120㎡相当まで。
            </div>
          </div>
          <div className="space-y-3">
            <Field label="土地面積">
              <NumInput value={h.landArea} onChange={v => set({ landArea: v })} suffix="坪" step={0.5} />
            </Field>
            <Field label="土地の評価単価（仮定）">
              <NumInput value={Number(h.propTaxLandUnitValue.toFixed(4))} onChange={v => set({ propTaxLandUnitValue: v })} suffix="万円/坪" step={0.1} />
            </Field>
            <div className="text-[11px] text-ink-sub mt-2">
              土地面積 {fmt(pt.landAreaM2, 2)}㎡。200㎡まで小規模住宅用地、超過分は一般住宅用地として按分。
            </div>
          </div>
        </div>

        {/* 評価額（自動 / 手動切替） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AssessmentField
            icon="🏠"
            label="建物評価額"
            autoValue={pt.buildAuto}
            current={h.propTaxBuildingValue}
            onChange={v => set({ propTaxBuildingValue: v })}
            formulaNote={`${fmt(h.buildArea, 2)}坪 × 約${fmt(h.propTaxBuildingUnitValue, 4)}万円/坪`}
          />
          <AssessmentField
            icon="🟫"
            label="土地評価額"
            autoValue={pt.landAuto}
            current={h.propTaxLandValue}
            onChange={v => set({ propTaxLandValue: v })}
            formulaNote={`${fmt(h.landArea, 2)}坪 × 約${fmt(h.propTaxLandUnitValue, 4)}万円/坪`}
          />
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 border-t border-line-card pt-4" aria-label="固定資産税等の年額" aria-live="polite">
          <div><dt className="text-xs text-ink-sub">新築軽減中（{pt.reductionYears}年間）・年額</dt><dd className="text-2xl font-bold tabular">{fmt(pt.during, 2)} <span className="text-xs font-normal">万円/年</span></dd><p className="text-xs text-ink-sub">建物 {fmt(pt.buildDuring, 2)} + 土地 {fmt(pt.landAnnual, 2)} 万円</p></div>
          <div><dt className="text-xs text-ink-sub">軽減終了後・年額</dt><dd className="text-2xl font-bold tabular">{fmt(pt.after, 2)} <span className="text-xs font-normal">万円/年</span></dd><p className="text-xs text-ink-sub">建物 {fmt(pt.buildAfter, 2)} + 土地 {fmt(pt.landAnnual, 2)} 万円</p></div>
        </dl>
        <p className="plan-note">出雲市の固定資産税1.5%{h.cityPlanningTaxEnabled ? '・都市計画税0.075%を含む' : '・都市計画税は含まない'}概算。単価の初期値（建物38万円/坪・土地11万円/坪）は市の公表値ではありません。以前の保存データは従来の評価額を面積で割った単価を引き継ぎます。建物代・土地代とは別の前提です。</p>
        <p className="plan-note">実際の評価額は市の調査で決まります。手動評価額は面積を変えても固定され、面積による軽減割合のみ変わります。新築軽減の要件・期間や評価替えは個別確認が必要です。</p>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`${bold ? 'text-ink-main font-semibold' : 'text-ink-sub'}`}>{label}</span>
      <span className={`tabular ${bold ? 'text-ink-main font-bold text-base' : negative ? 'text-status-danger font-medium' : 'text-ink-main font-medium'}`}>
        {value} <span className="text-xs text-ink-sub font-normal">万円</span>
      </span>
    </div>
  );
}

// ─── 評価額フィールド（自動/手動 トグル切替）───
function AssessmentField({ icon, label, autoValue, current, onChange, formulaNote }: {
  icon: string;
  label: string;
  autoValue: number;
  current: number | null;     // null = 自動 / number = 手動
  onChange: (v: number | null) => void;
  formulaNote: string;
}) {
  const isManual = current !== null;
  const displayValue = isManual ? (current as number) : autoValue;

  const setAuto = () => onChange(null);
  const setManual = () => { if (!isManual) onChange(autoValue); };

  return (
    <div className="border-t border-line-table pt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-bold text-ink-main">{label}</span>
        </div>
        <div className="flex rounded-[8px] border border-line-card overflow-hidden bg-bg-card">
          <button
            type="button"
            onClick={setAuto}
            aria-pressed={!isManual}
            aria-label={`${label}を自動計算`}
            className={`px-3 py-1 text-xs font-medium transition-colors ${!isManual ? 'bg-accent-blue text-white' : 'text-ink-sub hover:bg-bg-panel'}`}
          >🔗 自動反映</button>
          <button
            type="button"
            onClick={setManual}
            aria-pressed={isManual}
            aria-label={`${label}を手動入力`}
            className={`px-3 py-1 text-xs font-medium transition-colors ${isManual ? 'bg-accent-blue text-white' : 'text-ink-sub hover:bg-bg-panel'}`}
          >✍ 手動入力</button>
        </div>
      </div>

      {isManual ? (
        <Field label={`${label}（手動）`}><NumInput value={displayValue} onChange={v => onChange(v)} suffix="万円" /></Field>
      ) : (
        <div className="px-3 py-2 bg-bg-card border border-dashed border-line-card rounded-[8px] tabular text-right text-ink-main">
          {fmtMan(displayValue)} <span className="text-xs text-ink-sub font-normal">万円</span>
        </div>
      )}

      <div className="text-[11px] text-ink-sub mt-2 flex items-center gap-1.5">
        <span>{isManual ? '手動の評価額を固定。面積・単価による自動変更はしません。' : `${formulaNote}（自動: ${fmtMan(autoValue)}万円）`}</span>
      </div>
    </div>
  );
}
