import { Card, Field, NumInput, Select, Section } from '../ui';
import type { SimData, CalcResult } from '../../types';
import {
  BUILDING_ASSESSMENT_RATIO,
  LAND_ASSESSMENT_RATIO,
  calcMaxLoan,
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
  const miscAmt = h.miscMode === '100' ? h.building : Math.round(h.building * h.miscPct / 100);
  const totalCost = h.land + h.building + h.fuka + h.exterior + miscAmt;
  const netLoan = Math.max(0, totalCost - h.down);

  // 審査基準（単独・ペアローン共通）
  const reviewRate = h.reviewRate ?? 3;
  const reviewRatio = h.repRatio;
  const ratioOptions = [...new Set([20, 25, 30, 35, 40, reviewRatio])]
    .sort((a, b) => a - b)
    .map(value => ({ value, label: `${value}%` }));

  // 世帯年収（参考表示用・ボーナス込み）
  const householdAnnual = b.income + b.annualBonusInc + (b.spouseEnabled ? b.spouseIncome + b.spouseAnnualBonusInc : 0);
  // 借入審査に使う年収（単独=世帯主のみ / ペアローン=世帯合算）
  const isPair = b.loanBorrowType === 'pair' && b.spouseEnabled;
  const loanIncome = isPair ? householdAnnual : (b.income + b.annualBonusInc);

  // 他ローンの年返済（最大借入額からこの分を差し引く）
  const otherLoanAnnual = hh.otherLoan * 12;
  const annualBudget = loanIncome * reviewRatio / 100;            // 全ローン枠
  const annualForHousing = Math.max(0, annualBudget - otherLoanAnnual); // 住宅ローン用
  const maxLoan = calcMaxLoan(loanIncome, reviewRatio, reviewRate, l.years, hh.otherLoan);
  // 他ローンがない場合の最大借入額（比較用）
  const maxLoanNoOther = calcMaxLoan(loanIncome, reviewRatio, reviewRate, l.years, 0);
  const reducedBy = Math.max(0, maxLoanNoOther - maxLoan);

  // 自動評価額（建物本体価格・土地代ベース）
  const buildValAuto = Math.round(h.building * BUILDING_ASSESSMENT_RATIO);
  const landValAuto = Math.round(h.land * LAND_ASSESSMENT_RATIO);

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
              <Field label="📅 返済期間"><NumInput value={l.years} onChange={v => setLoan({ years: v })} suffix="年" /></Field>
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
                  土地・建物・付帯・外構・諸費用の合計
                </div>
              </div>

              {/* 頭金と借入予定額 */}
              <div className="pt-1 space-y-1">
                <Row label="▲ 頭金（自己資金）" value={`-${fmtMan(h.down)}`} negative />
              </div>
              <div className="bg-status-ok/8 border border-status-ok/30 rounded-[8px] p-3 mt-2">
                <div className="text-[11px] text-ink-label mb-0.5">借入予定額（総費用 − 頭金）</div>
                <div className="text-2xl font-bold tabular text-status-ok">
                  {fmtMan(netLoan)} <span className="text-sm font-normal text-ink-sub">万円</span>
                </div>
                {h.down > 0 && (
                  <div className="text-[11px] text-ink-sub mt-1">
                    総費用 {fmtMan(totalCost)}万 − 頭金 {fmtMan(h.down)}万 = {fmtMan(netLoan)}万
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
          建坪・土地面積から評価額を自動算出します。長期優良の軽減期間は「ローン計画」で設定。
        </p>

        {/* 面積入力 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-bg-panel border border-line-table rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📐</span>
              <span className="text-sm font-bold text-ink-main">建坪</span>
            </div>
            <NumInput value={h.buildArea} onChange={v => set({ buildArea: v })} suffix="坪" step={0.5} />
            <div className="text-[11px] text-ink-sub mt-2">
              新築軽減は住宅部分120㎡相当まで。建物評価額の按分に使います。
            </div>
          </div>
          <div className="bg-bg-panel border border-line-table rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🌍</span>
              <span className="text-sm font-bold text-ink-main">土地面積</span>
            </div>
            <NumInput value={h.landArea} onChange={v => set({ landArea: v })} suffix="坪" step={0.5} />
            <div className="text-[11px] text-ink-sub mt-2">
              200㎡まで小規模住宅用地、超過分は一般住宅用地として按分します。
            </div>
          </div>
        </div>

        {/* 評価額（自動 / 手動切替） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AssessmentField
            icon="🏠"
            label="建物評価額"
            autoValue={buildValAuto}
            current={h.propTaxBuildingValue}
            onChange={v => set({ propTaxBuildingValue: v })}
            formulaNote={`建物本体 ${fmtMan(h.building)}万円 × ${Math.round(BUILDING_ASSESSMENT_RATIO * 100)}%`}
          />
          <AssessmentField
            icon="🟫"
            label="土地評価額"
            autoValue={landValAuto}
            current={h.propTaxLandValue}
            onChange={v => set({ propTaxLandValue: v })}
            formulaNote={`土地代 ${fmtMan(h.land)}万円 × ${Math.round(LAND_ASSESSMENT_RATIO * 100)}%`}
          />
        </div>

        <div className="mt-4 bg-accent-blue/5 border border-accent-blue/20 rounded-[8px] p-3 text-xs text-ink-sub leading-relaxed">
          💬 <strong>参考（出雲市概算）:</strong> 建物3,000万・土地1,000万・35坪・60坪の場合、軽減中 約13万円/年、軽減終了後 約23万円/年。<br />
          実際の評価額は市の家屋調査・土地評価で決まります。納税通知書や資産税課の確認額がある場合は、手動入力に切り替えてください。
        </div>
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
  const setManual = () => onChange(autoValue); // 手動切替時は自動値で初期化

  return (
    <div className="bg-bg-panel border border-line-table rounded-[10px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-bold text-ink-main">{label}</span>
        </div>
        <div className="flex rounded-[8px] border border-line-card overflow-hidden bg-bg-card">
          <button
            type="button"
            onClick={setAuto}
            className={`px-3 py-1 text-xs font-medium transition-colors ${!isManual ? 'bg-accent-blue text-white' : 'text-ink-sub hover:bg-bg-panel'}`}
          >🔗 自動反映</button>
          <button
            type="button"
            onClick={setManual}
            className={`px-3 py-1 text-xs font-medium transition-colors ${isManual ? 'bg-accent-blue text-white' : 'text-ink-sub hover:bg-bg-panel'}`}
          >✍ 手動入力</button>
        </div>
      </div>

      {isManual ? (
        <NumInput value={displayValue} onChange={v => onChange(v)} suffix="万円" />
      ) : (
        <div className="px-3 py-2 bg-bg-card border border-dashed border-line-card rounded-[8px] tabular text-right text-ink-main">
          {fmtMan(displayValue)} <span className="text-xs text-ink-sub font-normal">万円</span>
        </div>
      )}

      <div className="text-[11px] text-ink-sub mt-2 flex items-center gap-1.5">
        <span>{isManual ? '✍ 任意の評価額で計算' : `🔗 ${formulaNote}（自動: ${fmtMan(autoValue)}万円）`}</span>
      </div>
    </div>
  );
}
