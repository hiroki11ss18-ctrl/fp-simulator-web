import { Card, Field, NumInput, Select, StatBox, Section, Toggle } from '../ui';
import type { SimData, CalcResult, HouseType } from '../../types';
import { calcTaxDeduction, calcPropertyTax, getTaxBorrowLimit, calcMaxLoan } from '../../hooks/useCalculations';
import { fmtMan, fmt } from '../../lib/format';

export default function LoanPlan({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const l = data.loan;
  const h = data.housing;
  const b = data.basic;
  const hh = data.household;
  const set = (patch: Partial<SimData['loan']>) => update({ loan: { ...l, ...patch } });
  const setHousing = (patch: Partial<SimData['housing']>) => update({ housing: { ...h, ...patch } });

  // 採用金利の第1期金利
  const r1 = l.loanType === 'fix' ? l.fixRate1 : l.varRate1;
  // 住宅ローン減税（実借入額に連動・ペアローン時は2人合算）
  const pairMode = b.loanBorrowType === 'pair' && b.spouseEnabled;
  const shareMain = pairMode ? (l.taxPairMainShare > 0 ? l.taxPairMainShare : 50) : 100;
  const mainLoanForTax = calc.loan * shareMain / 100;
  const spouseLoanForTax = pairMode ? calc.loan * (100 - shareMain) / 100 : 0;
  const tax = calcTaxDeduction(mainLoanForTax, r1, l.years, l.taxHouseType, l.taxMoveInYear, l.taxSpecialHousehold);
  const taxSp = pairMode ? calcTaxDeduction(spouseLoanForTax, r1, l.years, l.taxHouseType, l.taxMoveInYear, l.taxSpecialHousehold) : null;
  const limit = getTaxBorrowLimit(l.taxHouseType, l.taxMoveInYear, l.taxSpecialHousehold);
  // 合計控除（ペアの場合は2人合算）
  const totalDeduction = calc.taxDeductionTotal;
  const monthlyAvgTotal = totalDeduction / Math.max(1, calc.taxDeductionYears * 12);
  // 固定資産税
  const pt = calcPropertyTax(data.housing, data.loan);

  // 軽減効果（節税額）
  const savings = (pt.after - pt.during) * pt.reductionYears;

  // 実際の返済比率（住宅ローン + 他ローン）÷ 世帯年収
  const householdAnnual = b.income + b.annualBonusInc + (b.spouseEnabled ? b.spouseIncome + b.spouseAnnualBonusInc : 0);
  const totalMonthly = calc.monthly + hh.otherLoan;  // 住宅 + 他ローンの月返済合計
  const annualPayment = totalMonthly * 12;
  const actualRatio = householdAnnual > 0 ? annualPayment / householdAnnual * 100 : 0;
  // 返済比率の色判定
  const ratioTone =
    actualRatio <= 18 ? 'text-status-ok'
    : actualRatio <= 25 ? 'text-accent-blue'
    : actualRatio <= 30 ? 'text-status-warn'
    : 'text-status-danger';
  const ratioBg =
    actualRatio <= 18 ? 'bg-status-ok/8 border-status-ok/30'
    : actualRatio <= 25 ? 'bg-accent-blue/8 border-accent-blue/30'
    : actualRatio <= 30 ? 'bg-status-warn/8 border-status-warn/30'
    : 'bg-status-danger/8 border-status-danger/30';

  // 採用された金利・期間（変動 or 固定）
  const rates = l.loanType === 'fix' ? [l.fixRate1, l.fixRate2, l.fixRate3] : [l.varRate1, l.varRate2, l.varRate3];
  const periodEnds = l.loanType === 'fix' ? [l.fixPeriod1, l.fixPeriod2] : [l.varPeriod1, l.varPeriod2];

  // 実際の月別シミュレーション結果を使う。
  // ボーナス払い・繰上返済を入れた場合も、提案書と同じ金額を表示する。
  const phasePayments = [
    { phase: 1, years: periodEnds[0], rate: rates[0], monthly: calc.monthlyPhase1 || calc.monthly },
    { phase: 2, years: Math.max(0, periodEnds[1] - periodEnds[0]), rate: rates[1], monthly: calc.monthlyPhase2 },
    { phase: 3, years: Math.max(0, l.years - periodEnds[1]), rate: rates[2], monthly: calc.monthlyPhase3 },
  ];

  // 借入可能額の目安（採用金利・期間ベース、目標返済比率別）
  const ratioTargets = [
    { value: 18, label: '余裕重視', note: '👍 おすすめ', tone: 'ok' as const },
    { value: 20, label: '標準',     note: '一般的',     tone: 'blue' as const },
    { value: 25, label: 'やや積極', note: '',           tone: 'warn' as const },
    { value: 30, label: '上限近い', note: '',           tone: 'danger' as const },
  ];
  const proposals = ratioTargets.map(t => ({
    ...t,
    maxLoan: calcMaxLoan(householdAnnual, t.value, r1, l.years, hh.otherLoan),
  }));

  return (
    <div className="space-y-4">
      {/* 金利設定（最上部） */}
      <Card title="金利設定">
        {/* セグメンテッドコントロール */}
        <div className="inline-flex bg-bg-panel rounded-full p-1 mb-6 border border-line-table">
          <button
            type="button"
            className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wider transition-all ${l.loanType === 'var' ? 'bg-accent-blue text-white shadow-sm' : 'text-ink-sub hover:text-ink-main'}`}
            onClick={() => set({ loanType: 'var' })}
          >変動金利</button>
          <button
            type="button"
            className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wider transition-all ${l.loanType === 'fix' ? 'bg-accent-blue text-white shadow-sm' : 'text-ink-sub hover:text-ink-main'}`}
            onClick={() => set({ loanType: 'fix' })}
          >固定金利</button>
        </div>

        {(() => {
          const dur1 = l.loanType === 'var' ? l.varPeriod1 : l.fixPeriod1;
          const dur2 = (l.loanType === 'var' ? l.varPeriod2 : l.fixPeriod2) - dur1;
          const dur3 = Math.max(0, l.years - (l.loanType === 'var' ? l.varPeriod2 : l.fixPeriod2));
          const r = l.loanType === 'var' ? [l.varRate1, l.varRate2, l.varRate3] : [l.fixRate1, l.fixRate2, l.fixRate3];
          const totalForFlex = Math.max(1, l.years);

          const setDur1 = (v: number) => {
            const newP1 = Math.max(0, v);
            const newP2 = newP1 + Math.max(0, dur2);
            const newYears = newP2 + Math.max(0, dur3);
            if (l.loanType === 'var') set({ varPeriod1: newP1, varPeriod2: newP2, years: newYears });
            else set({ fixPeriod1: newP1, fixPeriod2: newP2, years: newYears });
          };
          const setDur2 = (v: number) => {
            const newP2 = dur1 + Math.max(0, v);
            const newYears = newP2 + Math.max(0, dur3);
            if (l.loanType === 'var') set({ varPeriod2: newP2, years: newYears });
            else set({ fixPeriod2: newP2, years: newYears });
          };
          const setDur3 = (v: number) => {
            const p2 = l.loanType === 'var' ? l.varPeriod2 : l.fixPeriod2;
            set({ years: p2 + Math.max(0, v) });
          };
          const setRate = (idx: 0 | 1 | 2, v: number) => {
            if (l.loanType === 'var') {
              if (idx === 0) set({ varRate1: v });
              else if (idx === 1) set({ varRate2: v });
              else set({ varRate3: v });
            } else {
              if (idx === 0) set({ fixRate1: v });
              else if (idx === 1) set({ fixRate2: v });
              else set({ fixRate3: v });
            }
          };

          const phases = [
            { num: 1, tone: 'ok' as const,   dur: dur1, rate: r[0], setDur: setDur1, setRate: (v: number) => setRate(0, v), startY: 0,           endY: dur1,         monthly: phasePayments[0].monthly },
            { num: 2, tone: 'blue' as const, dur: dur2, rate: r[1], setDur: setDur2, setRate: (v: number) => setRate(1, v), startY: dur1,        endY: dur1 + dur2,  monthly: phasePayments[1].monthly },
            { num: 3, tone: 'warn' as const, dur: dur3, rate: r[2], setDur: setDur3, setRate: (v: number) => setRate(2, v), startY: dur1 + dur2, endY: l.years,      monthly: phasePayments[2].monthly },
          ];

          return (
            <>
              {/* タイムラインバー */}
              <div className="mb-6">
                <div className="flex h-11 rounded-xl overflow-hidden border border-line-card">
                  {phases.map(p => {
                    const cls = p.tone === 'ok'   ? 'bg-gradient-to-b from-status-ok/25 to-status-ok/10 text-status-ok'
                              : p.tone === 'blue' ? 'bg-gradient-to-b from-accent-blue/25 to-accent-blue/10 text-accent-blue'
                                                  : 'bg-gradient-to-b from-status-warn/25 to-status-warn/10 text-status-warn';
                    return (
                      <div
                        key={p.num}
                        style={{ flex: Math.max(0.0001, p.dur) / totalForFlex }}
                        className={`${cls} flex flex-col items-center justify-center px-2 border-r border-line-card last:border-r-0 min-w-0`}
                      >
                        <span className="text-[10px] font-bold tracking-widest uppercase whitespace-nowrap">Phase {p.num}</span>
                        <span className="text-[11px] font-bold tabular whitespace-nowrap">{p.rate}%</span>
                      </div>
                    );
                  })}
                </div>
                <div className="relative h-4 mt-1 text-[10px] text-ink-sub tabular">
                  <span className="absolute left-0">0年</span>
                  <span className="absolute" style={{ left: `${dur1 / totalForFlex * 100}%`, transform: 'translateX(-50%)' }}>{dur1}年</span>
                  <span className="absolute" style={{ left: `${(dur1 + dur2) / totalForFlex * 100}%`, transform: 'translateX(-50%)' }}>{dur1 + dur2}年</span>
                  <span className="absolute right-0">{l.years}年</span>
                </div>
              </div>

              {/* 3 PhaseCard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {phases.map(p => {
                  const colors = p.tone === 'ok'
                    ? { border: 'border-status-ok/30',   head: 'bg-status-ok',   headSoft: 'bg-status-ok/5',   text: 'text-status-ok'   }
                    : p.tone === 'blue'
                      ? { border: 'border-accent-blue/30', head: 'bg-accent-blue', headSoft: 'bg-accent-blue/5', text: 'text-accent-blue' }
                      : { border: 'border-status-warn/30', head: 'bg-status-warn', headSoft: 'bg-status-warn/5', text: 'text-status-warn' };
                  return (
                    <div key={p.num} className={`rounded-2xl border ${colors.border} ${colors.headSoft} overflow-hidden flex flex-col`}>
                      {/* Header */}
                      <div className={`${colors.head} text-white px-4 py-2.5 flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold tracking-widest uppercase opacity-90">Phase</span>
                          <span className="text-lg font-bold tabular leading-none">{p.num}</span>
                        </div>
                        <span className="text-[10px] tabular opacity-90">{p.startY}〜{p.endY}年</span>
                      </div>
                      {/* Inputs */}
                      <div className="px-4 py-3 space-y-2.5 bg-bg-card">
                        <div>
                          <div className="text-[10px] font-bold text-ink-label uppercase tracking-wider mb-1">金利</div>
                          <div className="flex items-center bg-bg-panel rounded-lg border border-line-card focus-within:border-accent-blue">
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              value={!Number.isFinite(p.rate) || p.rate === 0 ? '' : p.rate}
                              placeholder="0"
                              onChange={e => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value);
                                p.setRate(Number.isFinite(v) ? Math.max(0, v) : 0);
                              }}
                              onKeyDown={e => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                              className={`w-full px-3 py-1.5 bg-transparent outline-none tabular text-right text-lg font-bold placeholder:text-ink-sub/50 ${colors.text}`}
                            />
                            <span className="px-3 text-ink-sub text-sm select-none">%</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-ink-label uppercase tracking-wider mb-1">期間</div>
                          <NumInput value={p.dur} onChange={p.setDur} suffix="年" />
                        </div>
                      </div>
                      {/* Result */}
                      <div className={`mt-auto px-4 py-3 bg-bg-panel border-t ${colors.border}`}>
                        <div className="text-[10px] text-ink-sub uppercase tracking-wider mb-0.5">月々返済額</div>
                        {p.dur > 0 ? (
                          <>
                            <div className={`text-2xl font-bold tabular ${colors.text} leading-tight`}>
                              {fmt(p.monthly, 2)}<span className="text-xs text-ink-sub ml-1 font-normal">万円/月</span>
                            </div>
                            <div className="text-[10px] text-ink-sub mt-0.5">年 {fmt(p.monthly * 12, 1)} 万円</div>
                          </>
                        ) : (
                          <div className="text-sm text-ink-sub">—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 合計返済期間 */}
              <div className="bg-bg-panel rounded-xl px-5 py-3 flex items-center justify-between border border-line-table">
                <span className="text-[10px] font-bold text-ink-sub uppercase tracking-widest">合計返済期間</span>
                <span className="text-2xl font-bold tabular text-ink-main leading-none">
                  {l.years}<span className="text-sm font-normal text-ink-sub ml-1">年</span>
                </span>
              </div>
            </>
          );
        })()}
      </Card>

      {/* 借入額・返済比率（実績） */}
      <Card title="💵 借入額・返済比率">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 実借入額入力 */}
          <div className="space-y-3">
            <Field label="✍ 実借入額（手動入力）" hint="0 と入れると自動値（総費用−頭金）を採用">
              <NumInput value={h.actualLoan} onChange={v => setHousing({ actualLoan: v })} suffix="万円" />
            </Field>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-bg-panel rounded-[8px] p-3">
                <div className="text-[11px] text-ink-label">自動借入額（総費用−頭金）</div>
                <div className="tabular font-bold text-ink-main mt-0.5">{fmtMan(calc.loanAuto)} <span className="text-xs font-normal text-ink-sub">万円</span></div>
              </div>
              <div className="bg-accent-blue/10 rounded-[8px] p-3">
                <div className="text-[11px] text-ink-label">採用 借入額</div>
                <div className="tabular font-bold text-accent-blue mt-0.5">{fmtMan(calc.loan)} <span className="text-xs font-normal text-ink-sub">万円</span></div>
              </div>
            </div>
            <div className="text-[11px] text-ink-sub">
              実借入額を入力すると、その金額を優先して採用します。0 のままなら自動値が採用されます。
            </div>
          </div>

          {/* 返済比率（実績） */}
          <div className={`rounded-[10px] border p-5 ${ratioBg}`}>
            <div className="text-xs font-bold text-ink-sub mb-1">
              📊 返済比率（実績）{hh.otherLoan > 0 && <span className="text-[10px] font-normal text-ink-sub ml-1">※住宅＋他ローン合算</span>}
            </div>
            <div className={`text-4xl font-bold tabular ${ratioTone}`}>
              {actualRatio.toFixed(1)}<span className="text-base font-normal text-ink-sub ml-1">%</span>
            </div>
            <div className="text-[11px] text-ink-sub mt-2 leading-relaxed">
              {hh.otherLoan > 0 ? (
                <>
                  住宅 <span className="tabular font-semibold text-ink-main">{fmt(calc.monthly, 2)}</span>万
                  ＋ 他ローン <span className="tabular font-semibold text-ink-main">{fmt(hh.otherLoan, 2)}</span>万
                  ＝ 月 <span className="tabular font-semibold text-ink-main">{fmt(totalMonthly, 2)}</span>万<br />
                  × 12 = 年返済 <span className="tabular font-semibold text-ink-main">{fmt(annualPayment, 1)}</span>万
                  ÷ 世帯年収 <span className="tabular font-semibold text-ink-main">{fmtMan(householdAnnual)}</span>万
                </>
              ) : (
                <>
                  月返済 <span className="tabular font-semibold text-ink-main">{fmt(calc.monthly, 2)}</span>万 × 12
                  ＝ 年返済 <span className="tabular font-semibold text-ink-main">{fmt(annualPayment, 1)}</span>万<br />
                  ÷ 世帯年収 <span className="tabular font-semibold text-ink-main">{fmtMan(householdAnnual)}</span>万
                </>
              )}
            </div>
            <div className="border-t border-line-table mt-3 pt-3">
              <div className="text-[11px] text-ink-sub leading-relaxed">
                💡 一般的に <span className="font-bold text-accent-blue">20〜25%</span> 程度。<br />
                余裕を持つなら <span className="font-bold text-status-ok">18%</span> くらいがベスト。
              </div>
              <div className="grid grid-cols-4 gap-1 mt-3 text-[10px] text-center">
                <div className={`rounded py-1 ${actualRatio <= 18 ? 'bg-status-ok text-white font-bold' : 'bg-bg-card text-ink-sub'}`}>〜18%<br/>余裕</div>
                <div className={`rounded py-1 ${actualRatio > 18 && actualRatio <= 25 ? 'bg-accent-blue text-white font-bold' : 'bg-bg-card text-ink-sub'}`}>〜25%<br/>標準</div>
                <div className={`rounded py-1 ${actualRatio > 25 && actualRatio <= 30 ? 'bg-status-warn text-white font-bold' : 'bg-bg-card text-ink-sub'}`}>〜30%<br/>注意</div>
                <div className={`rounded py-1 ${actualRatio > 30 ? 'bg-status-danger text-white font-bold' : 'bg-bg-card text-ink-sub'}`}>30%超<br/>過大</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 借入可能額の目安（提案） */}
      <Card title="💡 借入可能額の目安（提案）">
        <p className="text-xs text-ink-sub mb-4">
          世帯年収 <span className="tabular font-semibold text-ink-main">{fmtMan(householdAnnual)}</span> 万円 × 採用金利 <span className="tabular font-semibold text-ink-main">{r1}%</span> ・期間 <span className="tabular font-semibold text-ink-main">{l.years}年</span> で、各目標返済比率なら、いくらまで借りられるか:
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {proposals.map(p => {
            const diff = p.maxLoan - calc.loan;
            const isCurrent = Math.abs(diff) < 100; // 100万以内なら現在位置
            const cls = p.tone === 'ok' ? 'bg-status-ok/8 border-status-ok/40'
              : p.tone === 'blue' ? 'bg-accent-blue/8 border-accent-blue/40'
              : p.tone === 'warn' ? 'bg-status-warn/8 border-status-warn/40'
              : 'bg-status-danger/8 border-status-danger/40';
            const textCls = p.tone === 'ok' ? 'text-status-ok'
              : p.tone === 'blue' ? 'text-accent-blue'
              : p.tone === 'warn' ? 'text-status-warn'
              : 'text-status-danger';
            return (
              <div key={p.value} className={`rounded-[10px] border-2 p-4 ${cls} ${isCurrent ? 'ring-2 ring-offset-2 ring-ink-main/20' : ''}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`text-2xl font-bold tabular ${textCls}`}>{p.value}%</span>
                  <span className="text-[10px] text-ink-sub">{p.label}</span>
                </div>
                <div className="text-xl font-bold tabular text-ink-main">
                  {fmtMan(p.maxLoan)}<span className="text-xs ml-1 font-normal text-ink-sub">万円</span>
                </div>
                <div className="text-[11px] text-ink-sub mt-2 border-t border-line-table pt-2">
                  現在 <span className="tabular">{fmtMan(calc.loan)}</span>万 → <span className={`tabular font-bold ${diff >= 0 ? 'text-status-ok' : 'text-status-danger'}`}>{diff >= 0 ? '+' : ''}{fmtMan(diff)}</span>万 可能
                </div>
                {p.note && (
                  <div className={`text-[11px] font-bold mt-1 ${textCls}`}>{p.note}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-[8px] p-3 mt-4 text-xs text-ink-sub leading-relaxed">
          💬 <strong>使い方:</strong> 「建物4,900万のところ、もう少し余裕があるので5,200万まで借りられますよ」など、現実的な提案に活用できます。<br />
          <strong>18%（余裕重視）</strong> を目標にすると、繰上返済・教育費・老後資金にも余裕が残ります。
        </div>
      </Card>

      <Card title="💰 ボーナス払い">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="1回あたり"><NumInput value={l.bonusAmount} onChange={v => set({ bonusAmount: v })} suffix="万円" /></Field>
          <Field label="年間回数">
            <Select<number> value={l.bonusTimes} onChange={v => set({ bonusTimes: v })}
              options={[
                { value: 0, label: 'なし' },
                { value: 1, label: '年1回' },
                { value: 2, label: '年2回' },
                { value: 3, label: '年3回' },
              ]} />
          </Field>
          <Field label="ボーナス払い合計（期間）">
            <div className="px-3 py-2 bg-bg-panel rounded-[8px] tabular text-right text-ink-main">{fmtMan(l.bonusAmount * l.bonusTimes * l.years)} 万円</div>
          </Field>
        </div>
      </Card>

      <Card title="⏩ 繰り上げ返済">
        <Section title="返済方式">
          <div className="flex rounded-[8px] border border-line-card overflow-hidden w-fit mt-2">
            <button
              type="button"
              className={`px-4 py-2 text-sm transition-colors ${l.ptype === '期間短縮' ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
              onClick={() => set({ ptype: '期間短縮' })}
            >期間短縮</button>
            <button
              type="button"
              className={`px-4 py-2 text-sm transition-colors ${l.ptype === '返済額軽減' ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
              onClick={() => set({ ptype: '返済額軽減' })}
            >返済額軽減</button>
          </div>
          <div className="mt-2 text-xs text-ink-sub leading-relaxed">
            {l.ptype === '期間短縮'
              ? '完済年齢を早める計算です。月返済額は原則そのままにして、残り期間を短くします。'
              : '月返済額を軽くする計算です。返済期間は原則そのままなので、完済年齢は変わりにくいです。'}
          </div>
        </Section>
        <div className="h-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="1回目 実施年"><NumInput value={l.pyear} onChange={v => set({ pyear: v })} suffix="年目" /></Field>
          <Field label="1回目 金額"><NumInput value={l.pamount} onChange={v => set({ pamount: v })} suffix="万円" /></Field>
          <Field label="2回目 実施年"><NumInput value={l.pyear2} onChange={v => set({ pyear2: v })} suffix="年目" /></Field>
          <Field label="2回目 金額"><NumInput value={l.pamount2} onChange={v => set({ pamount2: v })} suffix="万円" /></Field>
        </div>
      </Card>

      {/* 完済予想（繰上返済の効果を自動反映） */}
      <Card title="🎂 完済予想">
        {(() => {
          const plannedAge = b.age + l.years;
          const plannedYear = new Date().getFullYear() + l.years;
          const actualAge = calc.completionAge;
          const actualYear = new Date().getFullYear() + (calc.completionAge - b.age);
          const shortenYears = plannedAge - actualAge;
          const prepayTotal = (l.pamount || 0) + (l.pamount2 || 0);
          const isPaymentReduction = l.ptype === '返済額軽減';
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* メイン: 完済年齢 */}
              <div className="lg:col-span-2 bg-accent-blue/10 border border-accent-blue/30 rounded-[12px] p-6 text-center">
                <div className="text-xs text-ink-sub">繰り上げ返済を反映した完済予想</div>
                <div className="text-5xl font-bold tabular text-accent-blue mt-2">
                  {actualAge}<span className="text-xl font-normal text-ink-sub ml-1">歳</span>
                </div>
                <div className="text-sm text-ink-sub mt-1">西暦 <span className="tabular font-semibold text-ink-main">{actualYear}</span> 年に完済</div>
                {shortenYears > 0 && (
                  <div className="inline-block bg-status-ok/15 text-status-ok rounded-full px-4 py-1 mt-3 text-sm font-bold">
                    🎉 当初予定より <span className="tabular">{shortenYears}</span> 年 短縮！
                  </div>
                )}
                {prepayTotal > 0 && isPaymentReduction && shortenYears === 0 && (
                  <div className="inline-block bg-status-warn/15 text-status-warn rounded-full px-4 py-1 mt-3 text-sm font-bold">
                    返済額軽減のため、完済年齢は原則そのまま
                  </div>
                )}
                {shortenYears === 0 && prepayTotal === 0 && (
                  <div className="text-xs text-ink-sub mt-3">※ 繰り上げ返済を設定すると短縮効果が表示されます</div>
                )}
              </div>

              {/* 内訳 */}
              <div className="space-y-2 text-sm">
                <div className="bg-bg-panel rounded-[10px] p-3">
                  <div className="text-[11px] text-ink-label">当初契約（{l.years}年返済）</div>
                  <div className="tabular font-bold text-ink-main mt-0.5">
                    {plannedAge} 歳<span className="text-xs text-ink-sub ml-1">/ {plannedYear}年</span>
                  </div>
                </div>
                <div className="bg-bg-panel rounded-[10px] p-3">
                  <div className="text-[11px] text-ink-label">繰上反映後の返済期間</div>
                  <div className="tabular font-bold text-ink-main mt-0.5">
                    {calc.repaymentYears} 年
                    {shortenYears > 0 && <span className="text-xs text-status-ok ml-1">（-{shortenYears}年）</span>}
                  </div>
                  {prepayTotal > 0 && isPaymentReduction && (
                    <div className="text-[10px] text-ink-sub mt-0.5">返済額軽減は月々の負担を下げる方式です</div>
                  )}
                </div>
                <div className="bg-bg-panel rounded-[10px] p-3">
                  <div className="text-[11px] text-ink-label">繰り上げ返済 合計</div>
                  <div className="tabular font-bold text-ink-main mt-0.5">
                    {fmtMan(prepayTotal)} <span className="text-xs text-ink-sub">万円</span>
                  </div>
                  {prepayTotal > 0 && (
                    <div className="text-[10px] text-ink-sub mt-0.5">
                      {l.pamount > 0 && `${l.pyear}年目: ${fmtMan(l.pamount)}万`}
                      {l.pamount > 0 && l.pamount2 > 0 && ' / '}
                      {l.pamount2 > 0 && `${l.pyear2}年目: ${fmtMan(l.pamount2)}万`}
                    </div>
                  )}
                </div>
                <div className="bg-bg-panel rounded-[10px] p-3">
                  <div className="text-[11px] text-ink-label">総返済額 / 利息</div>
                  <div className="tabular font-bold text-ink-main mt-0.5 text-sm">
                    {fmtMan(calc.actualTotalRepay)} 万円
                  </div>
                  <div className="text-[10px] text-status-danger mt-0.5">うち利息 {fmtMan(calc.actualTotalInt)} 万円</div>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      <Card title="🏛 住宅ローン控除（減税）" right={
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${pairMode ? 'bg-accent-blue/15 text-accent-blue' : 'bg-status-warn/15 text-status-warn'}`}>
          {pairMode ? '👫 ペアローン (2人合算)' : '🧑 単独'}
        </span>
      }>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="住宅種別">
            <Select<HouseType> value={l.taxHouseType} onChange={v => set({ taxHouseType: v })}
              options={[
                { value: 'long_term', label: '長期優良・低炭素' },
                { value: 'zeh', label: 'ZEH水準省エネ住宅' },
                { value: 'general', label: '省エネ基準適合住宅' },
              ]} />
          </Field>
          <Field label="入居年">
            <NumInput value={l.taxMoveInYear} onChange={v => set({ taxMoveInYear: v })} suffix="年" step={1} />
          </Field>
          <Field label="借入額（控除計算用）" hint="「借入額・返済比率」の実借入額と連動">
            <div className="px-3 py-2 bg-bg-panel rounded-[8px] tabular text-right text-ink-main">{fmtMan(calc.loan)} 万円</div>
          </Field>
          <Field label="控除年数">
            <div className="px-3 py-2 bg-bg-panel rounded-[8px] tabular text-right text-ink-main">{calc.taxDeductionYears} 年（控除率 0.7%）</div>
          </Field>
        </div>
        <div className="mt-3">
          <Toggle checked={l.taxSpecialHousehold} onChange={v => set({ taxSpecialHousehold: v })} label="子育て・若者夫婦世帯の上乗せを使う" />
          <div className="text-[10px] text-ink-sub mt-1">令和8・9年入居の借入限度額を採用。対象要件は入居時点の年齢・子の年齢などで最終確認が必要です。</div>
        </div>

        {/* ペアローン時の負担率と按分 */}
        {pairMode && (
          <div className="mt-5 bg-bg-panel rounded-[14px] border border-line-table p-5">
            {/* タイトル行 */}
            <div className="flex items-baseline justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-base">👫</span>
                <span className="text-sm font-bold text-ink-main tracking-wide">借入額の按分</span>
              </div>
              <span className="text-[10px] text-ink-sub">2人分の控除を最大化できます</span>
            </div>

            {/* ビジュアル按分バー */}
            <div className="relative h-16 rounded-[12px] overflow-hidden border border-line-card flex">
              <div
                style={{ width: `${l.taxPairMainShare}%`, minWidth: l.taxPairMainShare > 0 ? '70px' : '0' }}
                className="bg-gradient-to-br from-accent-blue/40 to-accent-blue/15 flex items-center px-4 transition-all duration-300 border-r border-accent-blue/30 overflow-hidden"
              >
                <div className="whitespace-nowrap">
                  <div className="text-[10px] font-bold text-accent-blue tracking-widest">🧑 世帯主</div>
                  <div className="text-xl font-bold tabular text-accent-blue leading-none mt-1">
                    {l.taxPairMainShare}<span className="text-xs">%</span>
                  </div>
                </div>
              </div>
              <div
                style={{ width: `${100 - l.taxPairMainShare}%`, minWidth: (100 - l.taxPairMainShare) > 0 ? '70px' : '0' }}
                className="bg-gradient-to-bl from-status-warn/40 to-status-warn/15 flex items-center justify-end px-4 transition-all duration-300 overflow-hidden"
              >
                <div className="text-right whitespace-nowrap">
                  <div className="text-[10px] font-bold text-status-warn tracking-widest">💑 配偶者</div>
                  <div className="text-xl font-bold tabular text-status-warn leading-none mt-1">
                    {100 - l.taxPairMainShare}<span className="text-xs">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* それぞれの借入額 */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-bg-card rounded-[10px] p-3 border-l-[3px] border-accent-blue">
                <div className="text-[10px] text-ink-sub uppercase tracking-wider">世帯主 控除対象額</div>
                <div className="text-lg tabular font-bold text-ink-main mt-0.5">
                  {fmtMan(mainLoanForTax)} <span className="text-xs font-normal text-ink-sub">万円</span>
                </div>
              </div>
              <div className="bg-bg-card rounded-[10px] p-3 border-r-[3px] border-status-warn text-right">
                <div className="text-[10px] text-ink-sub uppercase tracking-wider">配偶者 控除対象額</div>
                <div className="text-lg tabular font-bold text-ink-main mt-0.5">
                  {fmtMan(spouseLoanForTax)} <span className="text-xs font-normal text-ink-sub">万円</span>
                </div>
              </div>
            </div>

            {/* スライダー */}
            <div className="mt-4">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={l.taxPairMainShare}
                onChange={e => set({ taxPairMainShare: Number(e.target.value) })}
                className="w-full h-2 cursor-pointer"
                style={{ accentColor: '#2D7DD2' }}
              />
              {/* プリセットチップ */}
              <div className="flex justify-between gap-1.5 mt-2">
                {[
                  { v: 100, l: '100:0' },
                  { v: 70,  l: '70:30' },
                  { v: 50,  l: '50:50' },
                  { v: 30,  l: '30:70' },
                  { v: 0,   l: '0:100' },
                ].map(p => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => set({ taxPairMainShare: p.v })}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors tabular ${l.taxPairMainShare === p.v ? 'bg-accent-blue text-white shadow-sm' : 'bg-bg-card text-ink-sub border border-line-table hover:bg-line-table'}`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 控除合計表示 */}
        {pairMode ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {/* 世帯主の控除 */}
              <div className="rounded-[10px] border border-accent-blue/30 bg-accent-blue/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-bold text-accent-blue uppercase tracking-wider">🧑 世帯主</div>
                  <div className="text-[10px] text-ink-sub tabular">上限 {fmtMan(limit)}万 ({l.taxPairMainShare}%)</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-ink-sub">実借入額</div>
                    <div className="tabular font-bold text-ink-main">{fmtMan(Math.min(mainLoanForTax, limit))} 万</div>
                    {mainLoanForTax > limit && (
                      <div className="text-[9px] text-status-warn">⚠ 上限超過</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">控除年数</div>
                    <div className="tabular font-bold text-ink-main">{tax.deductYears} 年</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">控除合計</div>
                    <div className="tabular font-bold text-status-ok">{fmtMan(calc.taxDeductionMain)} 万</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">月額換算</div>
                    <div className="tabular font-bold text-status-ok">{fmt(calc.taxDeductionMain / Math.max(1, calc.taxDeductionYears * 12), 2)} 万/月</div>
                  </div>
                </div>
              </div>

              {/* 配偶者の控除 */}
              <div className="rounded-[10px] border border-status-warn/30 bg-status-warn/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-bold text-status-warn uppercase tracking-wider">💑 配偶者</div>
                  <div className="text-[10px] text-ink-sub tabular">上限 {fmtMan(limit)}万 ({100 - l.taxPairMainShare}%)</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-ink-sub">実借入額</div>
                    <div className="tabular font-bold text-ink-main">{fmtMan(Math.min(spouseLoanForTax, limit))} 万</div>
                    {spouseLoanForTax > limit && (
                      <div className="text-[9px] text-status-warn">⚠ 上限超過</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">控除年数</div>
                    <div className="tabular font-bold text-ink-main">{taxSp?.deductYears ?? 0} 年</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">控除合計</div>
                    <div className="tabular font-bold text-status-ok">{fmtMan(calc.taxDeductionSpouse)} 万</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-sub">月額換算</div>
                    <div className="tabular font-bold text-status-ok">{fmt(calc.taxDeductionSpouse / Math.max(1, calc.taxDeductionYears * 12), 2)} 万/月</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 合計 */}
            <div className="mt-3 bg-status-ok/10 border border-status-ok/30 rounded-[10px] p-4 text-center">
              <div className="text-[11px] text-ink-sub uppercase tracking-wider mb-1">2人合算 控除総額</div>
              <div className="text-3xl font-bold tabular text-status-ok">
                {fmtMan(totalDeduction)} <span className="text-sm font-normal text-ink-sub">万円</span>
              </div>
              <div className="text-[11px] text-ink-sub mt-1">
                月額換算 <span className="tabular font-semibold">{fmt(monthlyAvgTotal, 2)}</span> 万円/月
                ・ 世帯主 {fmtMan(calc.taxDeductionMain)}万 ＋ 配偶者 {fmtMan(calc.taxDeductionSpouse)}万
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatBox label="借入限度額" value={fmtMan(limit)} tone="normal" />
            <StatBox label="控除合計" value={fmtMan(calc.taxDeductionTotal)} tone="good" />
            <StatBox label="月額換算" value={fmt(calc.taxDeductionTotal / Math.max(1, calc.taxDeductionYears * 12), 2)} tone="good" suffix="万円/月" />
            <StatBox label="控除年数" value={`${calc.taxDeductionYears}`} suffix="年" tone="normal" />
          </div>
        )}
      </Card>

      <Card title="🏛 固定資産税">
        <Section title="住宅種別による軽減期間">
          <div className="flex items-center gap-3 mt-2">
            <Toggle checked={l.isLongTermHouse} onChange={v => set({ isLongTermHouse: v })} label={l.isLongTermHouse ? '長期優良住宅（5年軽減）' : '一般住宅（3年軽減）'} />
            <span className="text-xs text-ink-sub">※ 固定資産税の1/2軽減は建物120㎡相当分まで。都市計画税は軽減なし。</span>
          </div>
          <div className="mt-3">
            <Toggle checked={h.cityPlanningTaxEnabled} onChange={v => setHousing({ cityPlanningTaxEnabled: v })} label={h.cityPlanningTaxEnabled ? '都市計画税の対象区域（0.075%を含む）' : '都市計画税の対象区域外'} />
            <div className="text-[10px] text-ink-sub mt-1">出雲市の都市計画税は旧出雲市の都市計画区域用途地域などが対象です。土地所在地で確認してください。</div>
          </div>
        </Section>
        <div className="h-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-status-ok/10 border border-status-ok/30 rounded-[8px] p-4">
            <div className="text-xs font-bold text-status-ok mb-2">🟢 軽減期間中（{pt.reductionYears}年間）</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-ink-sub">年額</span><span className="tabular font-bold">{fmt(pt.during, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">建物分</span><span className="tabular">{fmt(pt.buildDuring, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">土地分</span><span className="tabular">{fmt(pt.landAnnual, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">月額</span><span className="tabular">{fmt(pt.during / 12, 2)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">{pt.reductionYears}年間合計</span><span className="tabular font-bold">{fmt(pt.during * pt.reductionYears, 1)} 万円</span></div>
            </div>
          </div>
          <div className="bg-status-danger/10 border border-status-danger/30 rounded-[8px] p-4">
            <div className="text-xs font-bold text-status-danger mb-2">🔴 軽減終了後（ずっと続く）</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-ink-sub">年額</span><span className="tabular font-bold">{fmt(pt.after, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">建物分</span><span className="tabular">{fmt(pt.buildAfter, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">土地分</span><span className="tabular">{fmt(pt.landAnnual, 1)} 万円</span></div>
              <div className="flex justify-between"><span className="text-ink-sub">月額</span><span className="tabular">{fmt(pt.after / 12, 2)} 万円</span></div>
            </div>
          </div>
        </div>
        <div className="bg-accent-blue/10 rounded-[8px] p-3 mt-3 text-sm">
          💡 節税効果: <span className="tabular font-bold text-accent-blue">{fmt(savings, 1)} 万円</span>（{pt.reductionYears}年間で）
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <StatBox label="採用 建物評価" value={fmtMan(pt.buildVal)} tone="normal" />
          <StatBox label="採用 土地評価" value={fmtMan(pt.landVal)} tone="normal" />
          <StatBox label="小規模住宅用地" value={fmt(pt.smallLandM2, 0)} suffix="㎡" tone="normal" />
          <StatBox label="一般住宅用地" value={fmt(pt.generalLandM2, 0)} suffix="㎡" tone="normal" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <StatBox label={`${data.simYears}年間 総支払額`} value={fmt(calc.totalPropTax, 1)} tone="bad" />
          <StatBox label={`${data.simYears}年間 月平均`} value={fmt(calc.totalPropTax / data.simYears / 12, 2)} suffix="万円/月" tone="normal" />
          <StatBox label="建物軽減対象" value={fmt(Math.min(pt.buildAreaM2, 120), 0)} suffix="㎡" tone="good" />
          <StatBox label="建物軽減対象外" value={fmt(Math.max(0, pt.buildAreaM2 - 120), 0)} suffix="㎡" tone="normal" />
        </div>
        <div className="bg-bg-panel rounded-[8px] p-3 mt-3 text-xs text-ink-sub">
          📐 出雲市税率: 固定資産税 1.5%{h.cityPlanningTaxEnabled ? ' ／ 都市計画税 0.075%（対象区域）' : ' ／ 都市計画税なし（対象区域外）'}<br />
          🏠 建物: 軽減中は120㎡相当分まで固定資産税を1/2、都市計画税は通常計算<br />
          🟫 土地: 200㎡まで小規模住宅用地（固資1/6・都計1/3）、超過分は一般住宅用地（固資1/3・都計2/3）<br />
          📅 期間: {data.basic.age}歳〜{data.basic.age + data.simYears}歳までの {data.simYears}年間の合計
        </div>
      </Card>
    </div>
  );
}
