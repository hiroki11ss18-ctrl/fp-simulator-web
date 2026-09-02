import { Card, Field, NumInput, Toggle, Section } from '../ui';
import type { SimData, CalcResult } from '../../types';
import { solarMonthlyGenArr } from '../../hooks/useCalculations';
import { fmtMan, fmt } from '../../lib/format';
import { BarChart, Bar, Line, ComposedChart, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function SolarBattery({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const s = data.solar;
  const set = (patch: Partial<SimData['solar']>) => update({ solar: { ...s, ...patch } });

  const monthly = solarMonthlyGenArr(s);
  const annualKwh = monthly.reduce((a, b) => a + b, 0);

  // 月別発電量を編集（初回は自動値で全12個を初期化、以降は該当月のみ上書き）
  const setMonth = (i: number, v: number) => {
    const arr = s.genM.length === 12 ? [...s.genM] : monthly.slice();
    arr[i] = Math.max(0, v);
    set({ genM: arr, genAuto: false });
  };

  // ─── 電気代3パターン比較（月額） ───
  // 使用量・発電量・電気代（月次ベース）
  const dayRatio = s.dayUsageRatio / 100;
  const nightRatio = 1 - dayRatio;
  const monthlyKwh = s.monthlyUsage;
  const monthlyGenAvg = annualKwh / 12;

  // 現在の電気代（自動 or 手動）
  const autoBill = monthlyKwh * (dayRatio * s.elecPriceDay + nightRatio * s.elecPriceNight) / 1e4;
  const noSolarMonthly = (s.elecBillManual !== null && s.elecBillManual > 0) ? s.elecBillManual : autoBill;

  // 自家消費率
  const selfRateSolar = s.selfRateManual
    ? s.selfRateSolar / 100
    : Math.min(1, (monthlyKwh * dayRatio) / Math.max(monthlyGenAvg, 0.001));
  const selfRateBatt = s.selfRateManual
    ? s.selfRateBatt / 100
    : Math.min(0.95, selfRateSolar + (s.battCapacity * 30 * nightRatio) / Math.max(monthlyGenAvg, 0.001));

  // 太陽光のみ: 節電額 = 月間発電量 × 自家消費率 × 昼単価 / 10000
  const savingsSolar = monthlyGenAvg * selfRateSolar * s.elecPriceDay / 1e4;
  const solarOnlyMonthly = Math.max(0, noSolarMonthly - savingsSolar);

  // 太陽光＋蓄電池: 節電額（増加分は夜間使用を蓄電池で代替=夜単価相当）
  //   = 月間発電量 × 太陽光分×昼単価 + 月間発電量 × 蓄電池追加分×夜単価
  const extraBatt = Math.max(0, selfRateBatt - selfRateSolar); // 蓄電池追加で自家消費率がさらに増える分
  const savingsBatt = monthlyGenAvg * selfRateSolar * s.elecPriceDay / 1e4
                    + monthlyGenAvg * extraBatt * s.elecPriceNight / 1e4;
  const solarBattMonthly = Math.max(0, noSolarMonthly - savingsBatt);

  // ─── 累積収支（simYears 連動・年間効果バー付き） ───
  const simY = data.simYears;
  const initCost = s.solarCost + (s.battEnabled ? s.battCost : 0);
  // 主シナリオ（蓄電池ONなら +蓄電池、OFFなら 太陽光のみ）
  const useBattScenario = s.battEnabled;
  const cumulData: {
    year: number;
    年間効果_FIT中: number;     // FIT期間内の年間効果（プラスのみ）
    年間効果_FIT後: number;     // FIT終了後の年間効果（プラスのみ）
    メンテ費: number;            // メンテ費（マイナス）
    累積_太陽光: number;
    累積_蓄電池併用: number;
  }[] = [];
  let cum1 = -s.solarCost;
  let cum2 = -initCost;
  let breakEvenSolar = -1;
  let breakEvenBatt = -1;
  for (let y = 0; y <= simY; y++) {
    let annualFit = 0;
    let annualPost = 0;
    let maintCost = 0;
    if (y > 0) {
      const annualSellKwh1 = monthlyGenAvg * 12 * (1 - selfRateSolar);
      const annualSellKwh2 = monthlyGenAvg * 12 * (1 - selfRateBatt);
      const isFit = y <= s.fitYears;
      const rate = isFit ? s.fitRate : s.fitRateAfter;

      const annualSavingsSolar = (noSolarMonthly - solarOnlyMonthly) * 12;
      const sellSolar = annualSellKwh1 * rate / 1e4;
      cum1 += annualSavingsSolar + sellSolar;

      const annualSavingsBatt = (noSolarMonthly - solarBattMonthly) * 12;
      const sellBatt = annualSellKwh2 * rate / 1e4;
      cum2 += annualSavingsBatt + sellBatt;

      // メンテ費
      if (s.powerconCycle > 0 && y % s.powerconCycle === 0) { cum1 -= s.powerconCost; cum2 -= s.powerconCost; maintCost -= s.powerconCost; }
      if (s.solarMaintCycle > 0 && y % s.solarMaintCycle === 0) { cum1 -= s.solarMaintCost; cum2 -= s.solarMaintCost; maintCost -= s.solarMaintCost; }
      if (s.battEnabled && s.battReplaceCycle > 0 && y % s.battReplaceCycle === 0) { cum2 -= s.battReplaceCost; if (useBattScenario) maintCost -= s.battReplaceCost; }

      const annualPure = useBattScenario ? (annualSavingsBatt + sellBatt) : (annualSavingsSolar + sellSolar);
      if (isFit) annualFit = annualPure; else annualPost = annualPure;

      if (breakEvenSolar < 0 && cum1 >= 0) breakEvenSolar = y;
      if (breakEvenBatt < 0 && cum2 >= 0) breakEvenBatt = y;
    }
    cumulData.push({
      year: y,
      年間効果_FIT中: Math.round(annualFit),
      年間効果_FIT後: Math.round(annualPost),
      メンテ費: Math.round(maintCost),
      累積_太陽光: Math.round(cum1),
      累積_蓄電池併用: Math.round(cum2),
    });
  }

  const chartData = MONTH_LABELS.map((label, i) => {
    const gen = Math.round(monthly[i] || 0);
    const self = Math.round(gen * selfRateSolar);
    const sell = Math.max(0, gen - self);
    return { label, 発電: gen, 自家消費: self, 売電: sell };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 太陽光 導入トグル */}
        <div className={`rounded-[12px] border-2 p-4 transition-colors ${s.enabled ? 'bg-status-warn/8 border-status-warn/40' : 'bg-bg-card border-line-card'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${s.enabled ? 'bg-status-warn/15' : 'bg-bg-panel'}`}>
                ☀️
              </div>
              <div>
                <div className="text-sm font-bold text-ink-main">太陽光</div>
                <div className="text-[11px] text-ink-sub">{s.enabled ? '導入する' : '導入しない'}</div>
              </div>
            </div>
            <Toggle
              checked={s.enabled}
              onChange={v => set({ enabled: v, battEnabled: v ? s.battEnabled : false })}
            />
          </div>
        </div>

        {/* 蓄電池 導入トグル */}
        <div className={`rounded-[12px] border-2 p-4 transition-colors ${s.battEnabled ? 'bg-accent-blue/8 border-accent-blue/40' : 'bg-bg-card border-line-card'} ${!s.enabled ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${s.battEnabled ? 'bg-accent-blue/15' : 'bg-bg-panel'}`}>
                🔋
              </div>
              <div>
                <div className="text-sm font-bold text-ink-main">蓄電池</div>
                <div className="text-[11px] text-ink-sub">
                  {!s.enabled ? '太陽光をONにすると選択可' : s.battEnabled ? '導入する' : '導入しない'}
                </div>
              </div>
            </div>
            <Toggle
              checked={s.battEnabled}
              onChange={v => s.enabled && set({ battEnabled: v })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左列：設定 */}
        <div className="space-y-4">
          <Card title="🔋 基本設定">
            {/* 太陽光セクション */}
            <div className={`rounded-[10px] border p-4 ${s.enabled ? 'border-status-warn/30 bg-status-warn/5' : 'border-line-table bg-bg-panel/30 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">☀️</span>
                <span className="text-[12px] font-bold tracking-widest text-status-warn uppercase">太陽光</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="パネル容量"><NumInput value={s.solarKw} onChange={v => set({ solarKw: v })} step={0.1} suffix="kW" /></Field>
                <Field label="パワコン容量"><NumInput value={s.powerconKw} onChange={v => set({ powerconKw: v })} step={0.1} suffix="kW" /></Field>
                <Field label="システム設置費用"><NumInput value={s.solarCost} onChange={v => set({ solarCost: v })} suffix="万円" /></Field>
              </div>
            </div>

            {/* 蓄電池セクション */}
            <div className={`rounded-[10px] border p-4 mt-3 ${s.battEnabled ? 'border-accent-blue/30 bg-accent-blue/5' : 'border-line-table bg-bg-panel/30 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🔋</span>
                <span className="text-[12px] font-bold tracking-widest text-accent-blue uppercase">蓄電池</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="蓄電池容量"><NumInput value={s.battCapacity} onChange={v => set({ battCapacity: v })} step={0.5} suffix="kWh" /></Field>
                <Field label="蓄電池費用"><NumInput value={s.battCost} onChange={v => set({ battCost: v })} suffix="万円" /></Field>
              </div>
            </div>
          </Card>

          <Card title="⚡ 電気の使用状況">
            <div className="grid grid-cols-2 gap-4">
              <Field label="月間電気使用量"><NumInput value={s.monthlyUsage} onChange={v => set({ monthlyUsage: v })} suffix="kWh/月" /></Field>
              <Field label="昼間使用割合"><NumInput value={s.dayUsageRatio} onChange={v => set({ dayUsageRatio: v })} min={0} max={100} suffix="%" step={5} /></Field>
              <Field label="昼間 買電単価"><NumInput value={s.elecPriceDay} onChange={v => set({ elecPriceDay: v })} step={0.5} suffix="円/kWh" /></Field>
              <Field label="夜間 買電単価"><NumInput value={s.elecPriceNight} onChange={v => set({ elecPriceNight: v })} step={0.5} suffix="円/kWh" /></Field>
            </div>

            {/* 現在の電気代 自動/手動 トグル */}
            <div className="mt-4 bg-bg-panel rounded-[10px] p-4 border border-line-table">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold text-ink-label uppercase tracking-wider">💡 現在の月の電気代</div>
                <div className="flex rounded-full border border-line-card overflow-hidden bg-bg-card">
                  <button
                    type="button"
                    onClick={() => set({ elecBillManual: null })}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${s.elecBillManual === null ? 'bg-accent-blue text-white' : 'text-ink-sub'}`}
                  >自動計算</button>
                  <button
                    type="button"
                    onClick={() => set({ elecBillManual: s.elecBillManual ?? Number(autoBill.toFixed(2)) })}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${s.elecBillManual !== null ? 'bg-accent-blue text-white' : 'text-ink-sub'}`}
                  >手動入力</button>
                </div>
              </div>
              {s.elecBillManual === null ? (
                <div>
                  <div className="text-3xl font-bold tabular text-accent-blue leading-none">
                    {fmt(autoBill, 2)}<span className="text-sm font-normal text-ink-sub ml-1">万円/月</span>
                  </div>
                  {/* 昼間 / 夜間 内訳 */}
                  {(() => {
                    const dayKwh = monthlyKwh * dayRatio;
                    const nightKwh = monthlyKwh * nightRatio;
                    const dayYen = dayKwh * s.elecPriceDay;
                    const nightYen = nightKwh * s.elecPriceNight;
                    return (
                      <div className="mt-3 bg-bg-card rounded-[8px] p-3 border border-line-table text-xs">
                        <div className="flex justify-between py-0.5">
                          <span className="text-ink-sub">☀️ 昼間 ({Math.round(dayRatio * 100)}%)</span>
                          <span className="tabular text-ink-main">
                            {fmt(dayKwh, 0)} kWh × {s.elecPriceDay}円 = <span className="font-bold text-accent-blue">{fmt(dayYen, 0)} 円</span>
                            <span className="text-ink-sub ml-1">({fmt(dayYen / 1e4, 2)}万)</span>
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-ink-sub">🌙 夜間 ({Math.round(nightRatio * 100)}%)</span>
                          <span className="tabular text-ink-main">
                            {fmt(nightKwh, 0)} kWh × {s.elecPriceNight}円 = <span className="font-bold text-accent-blue">{fmt(nightYen, 0)} 円</span>
                            <span className="text-ink-sub ml-1">({fmt(nightYen / 1e4, 2)}万)</span>
                          </span>
                        </div>
                        <div className="border-t border-line-table mt-1.5 pt-1.5 flex justify-between font-semibold">
                          <span className="text-ink-main">合計</span>
                          <span className="tabular text-accent-blue">
                            {fmt(dayYen + nightYen, 0)} 円 ({fmt(autoBill, 2)} 万円)
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div>
                  <NumInput value={s.elecBillManual} onChange={v => set({ elecBillManual: v > 0 ? v : null })} step={0.1} suffix="万円/月" />
                  <div className="text-[10px] text-ink-sub mt-1">参考: 自動計算値は {fmt(autoBill, 2)} 万円/月</div>
                </div>
              )}
            </div>
          </Card>

          <Card title="💴 売電設定">
            {/* 年間発電量（採用値を直接編集） */}
            <div className="bg-status-warn/5 border border-status-warn/20 rounded-[12px] p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-status-warn uppercase tracking-wider">☀️ 採用 年間発電量</span>
                <div className="flex items-center gap-2">
                  {s.genAnnualKwh > 0 ? (
                    <>
                      <span className="text-[10px] bg-status-warn/20 text-status-warn px-1.5 py-0.5 rounded font-bold">手入力</span>
                      <button
                        type="button"
                        onClick={() => set({ genAnnualKwh: 0 })}
                        className="text-[10px] text-accent-blue hover:underline"
                      >自動値に戻す</button>
                    </>
                  ) : (
                    <span className="text-[10px] bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded font-bold">自動計算中</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <Field label="年間発電量" hint={`自動値 ${Math.round(s.solarKw * 1100 * (s.solarKw > 0 ? Math.min(1, s.powerconKw / s.solarKw) : 1)).toLocaleString()} kWh（パネル×1100×効率）／ 📍 島根の平均 5,200 kWh`}>
                  <NumInput
                    value={s.genAnnualKwh > 0 ? s.genAnnualKwh : Math.round(s.solarKw * 1100 * (s.solarKw > 0 ? Math.min(1, s.powerconKw / s.solarKw) : 1))}
                    onChange={v => set({ genAnnualKwh: v, genAuto: true, genM: [] })}
                    suffix="kWh/年"
                    step={100}
                  />
                </Field>
                <div>
                  <div className="text-[10px] font-bold text-ink-label uppercase tracking-wider mb-1">月平均（自動算出）</div>
                  <div className="px-3 py-2 bg-bg-card rounded-[8px] tabular text-right text-status-warn font-bold">
                    {Math.round(monthlyGenAvg).toLocaleString()} <span className="text-xs text-ink-sub font-normal">kWh/月</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="FIT 売電単価"><NumInput value={s.fitRate} onChange={v => set({ fitRate: v })} step={0.5} suffix="円/kWh" /></Field>
              <Field label="FIT 終了後 売電単価"><NumInput value={s.fitRateAfter} onChange={v => set({ fitRateAfter: v })} step={0.5} suffix="円/kWh" /></Field>
              <Field label="FIT 期間"><NumInput value={s.fitYears} onChange={v => set({ fitYears: v })} suffix="年" step={1} /></Field>
            </div>
          </Card>

          <Card title="🔧 メンテナンスコスト">
            <div className="grid grid-cols-2 gap-4">
              <Field label="パワコン交換費"><NumInput value={s.powerconCost} onChange={v => set({ powerconCost: v })} suffix="万円" /></Field>
              <Field label="パワコン交換サイクル"><NumInput value={s.powerconCycle} onChange={v => set({ powerconCycle: v })} suffix="年" /></Field>
              <Field label="点検・清掃費"><NumInput value={s.solarMaintCost} onChange={v => set({ solarMaintCost: v })} suffix="万円/回" /></Field>
              <Field label="点検サイクル"><NumInput value={s.solarMaintCycle} onChange={v => set({ solarMaintCycle: v })} suffix="年" /></Field>
              <Field label="蓄電池交換費"><NumInput value={s.battReplaceCost} onChange={v => set({ battReplaceCost: v })} suffix="万円" /></Field>
              <Field label="蓄電池交換サイクル"><NumInput value={s.battReplaceCycle} onChange={v => set({ battReplaceCycle: v })} suffix="年" /></Field>
            </div>
          </Card>
        </div>

        {/* 右列：シミュレーション */}
        <div className="space-y-4">
          <Card title="📊 自家消費率の設定">
            <div className="flex items-center gap-3 mb-3">
              <Toggle checked={s.selfRateManual} onChange={v => set({ selfRateManual: v })} label={s.selfRateManual ? '手動' : '自動'} />
              <span className="text-xs text-ink-sub">{s.selfRateManual ? '値を直接指定' : '使用パターンから自動計算'}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="太陽光のみ"><NumInput value={s.selfRateSolar} onChange={v => set({ selfRateSolar: v })} min={0} max={100} suffix="%" /></Field>
              <Field label="太陽光＋蓄電池"><NumInput value={s.selfRateBatt} onChange={v => set({ selfRateBatt: v })} min={0} max={100} suffix="%" /></Field>
            </div>
            <div className="text-xs text-ink-sub mt-2">
              自動計算（参考）: 太陽光のみ {Math.round(selfRateSolar * 100)}% ／ +蓄電池 約 {Math.round(selfRateBatt * 100)}%
            </div>
          </Card>

          <Card title="💡 電気代 比較（月額）">
            {(() => {
              // 売電収入（月額）= 売電量(月) × 単価 / 10000
              // 売電量 = 月間発電量 × (1 - 自家消費率)
              const sellSolarMonthlyFit  = monthlyGenAvg * (1 - selfRateSolar) * s.fitRate      / 1e4;
              const sellSolarMonthlyPost = monthlyGenAvg * (1 - selfRateSolar) * s.fitRateAfter / 1e4;
              const sellBattMonthlyFit   = monthlyGenAvg * (1 - selfRateBatt)  * s.fitRate      / 1e4;
              const sellBattMonthlyPost  = monthlyGenAvg * (1 - selfRateBatt)  * s.fitRateAfter / 1e4;

              // 実質負担 = 電気代 - 売電収入
              const netSolarFit  = solarOnlyMonthly - sellSolarMonthlyFit;
              const netSolarPost = solarOnlyMonthly - sellSolarMonthlyPost;
              const netBattFit   = solarBattMonthly - sellBattMonthlyFit;
              const netBattPost  = solarBattMonthly - sellBattMonthlyPost;

              // 発電量による利益（FIT中・FIT後）= 自家消費による節電 + 売電収入
              //   = noSolarMonthly - 実質負担（net）
              const benefitSolarFit  = noSolarMonthly - netSolarFit;
              const benefitSolarPost = noSolarMonthly - netSolarPost;
              const benefitBattFit   = noSolarMonthly - netBattFit;
              const benefitBattPost  = noSolarMonthly - netBattPost;

              type Pattern = {
                tone: 'good' | 'normal' | 'bad';
                icon: string;
                label: string;
                baseline: number;          // 電気代（基本の支出）= 太陽光なしの電気代
                benefitFit?: number;       // 発電量による利益（FIT中）. undefined なら「何もなし」
                benefitPost?: number;      // 発電量による利益（FIT後）
              };
              const patterns: Pattern[] = [
                { tone: 'bad', icon: '🏠', label: '何もなし', baseline: noSolarMonthly },
              ];
              if (s.enabled) {
                const useBatt = s.battEnabled;
                patterns.push({
                  tone: 'good',
                  icon: useBatt ? '🔋' : '☀️',
                  label: useBatt ? '太陽光・蓄電池' : '太陽光のみ',
                  baseline: noSolarMonthly,
                  benefitFit:  useBatt ? benefitBattFit  : benefitSolarFit,
                  benefitPost: useBatt ? benefitBattPost : benefitSolarPost,
                });
              }
              const cols = patterns.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
              return (
                <>
                  <div className={`grid ${cols} gap-3`}>
                    {patterns.map((p, i) => (
                      <PatternCardV2
                        key={i}
                        tone={p.tone}
                        icon={p.icon}
                        label={p.label}
                        baseline={p.baseline}
                        benefitFit={p.benefitFit}
                        benefitPost={p.benefitPost}
                      />
                    ))}
                  </div>
                  {!s.enabled && (
                    <div className="text-[11px] text-ink-sub mt-3 bg-bg-panel rounded-[8px] px-3 py-2 text-center">
                      💡 太陽光を導入すると「太陽光のみ」の試算が表示されます
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

          <Card title="📅 月別発電量グラフ">
            <p className="text-[11px] text-ink-sub mb-3">📌 月別の値は「売電設定」で編集できます。グラフは自家消費分と売電分の積み上げ表示です。</p>
            <div className="h-56 mt-3">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#F1F0EC" />
                  <XAxis dataKey="label" stroke="#787774" />
                  <YAxis stroke="#787774" tickFormatter={v => `${v.toLocaleString()}`} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} kWh`} />
                  <Legend />
                  <Bar dataKey="自家消費" stackId="a" fill="#3DAA7B" />
                  <Bar dataKey="売電" stackId="a" fill="#2D7DD2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-ink-sub mt-2">年間発電量: <span className="tabular font-semibold text-ink-main">{Math.round(calc.annualKwh).toLocaleString()} kWh</span></div>
          </Card>

          <Card title={`📈 累積収支の推移（${simY}年）`}>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={cumulData} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid stroke="#F1F0EC" />
                  <XAxis dataKey="year" stroke="#787774" tickFormatter={v => `${v}年`} />
                  <YAxis yAxisId="bar" orientation="right" stroke="#787774" tickFormatter={v => `${v}万`} />
                  <YAxis yAxisId="line" stroke="#2D7DD2" tickFormatter={v => `${v.toLocaleString()}万`} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()}万円`} labelFormatter={(v: any) => `${v}年目`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* FIT終了の基準線 */}
                  {s.fitYears <= simY && (
                    <ReferenceLine yAxisId="line" x={s.fitYears} stroke="#E55B4D" strokeDasharray="4 4" label={{ value: `⚠ FIT終了 (${s.fitYears}年目)`, position: 'top', fill: '#E55B4D', fontSize: 11 }} />
                  )}
                  {/* 年間効果バー */}
                  <Bar yAxisId="bar" dataKey="年間効果_FIT中" stackId="b" fill="#3DAA7B" name="年効果(FIT中)" />
                  <Bar yAxisId="bar" dataKey="年間効果_FIT後" stackId="b" fill="#E8A838" name="年効果(FIT後)" />
                  <Bar yAxisId="bar" dataKey="メンテ費" stackId="b" fill="#E55B4D" name="メンテ費" />
                  {/* 累積線 */}
                  <Line yAxisId="line" type="monotone" dataKey="累積_太陽光" stroke="#3DAA7B" strokeWidth={2.5} dot={false} name="累積 (太陽光のみ)" />
                  {s.battEnabled && <Line yAxisId="line" type="monotone" dataKey="累積_蓄電池併用" stroke="#2D7DD2" strokeWidth={2.5} dot={false} name="累積 (+蓄電池)" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-ink-sub mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>📊 右軸: 年間効果（緑=FIT中・橙=FIT後・赤=メンテ費）</span>
              <span>📈 左軸: 累積収支（{useBattScenario ? '青=蓄電池併用' : '緑=太陽光のみ'}）</span>
            </div>

            {/* 回収完了年 */}
            <div className={`grid ${s.battEnabled ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mt-3`}>
              <div className={`rounded-[10px] p-3 border ${breakEvenSolar > 0 ? 'bg-status-ok/8 border-status-ok/30' : 'bg-bg-panel border-line-table'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">☀️</span>
                  <span className="text-[10px] font-bold text-status-ok uppercase tracking-wider">太陽光のみ</span>
                </div>
                {breakEvenSolar > 0 ? (
                  <div className="tabular">
                    <span className="text-xl font-bold text-status-ok">{breakEvenSolar}</span>
                    <span className="text-xs text-ink-sub ml-1">年目で回収完了</span>
                  </div>
                ) : (
                  <div className="text-xs text-ink-sub">{simY}年内で回収不可</div>
                )}
                <div className="text-[10px] text-ink-sub mt-1">初期投資 -{fmtMan(s.solarCost)}万</div>
              </div>
              {s.battEnabled && (
                <div className={`rounded-[10px] p-3 border ${breakEvenBatt > 0 ? 'bg-status-warn/8 border-status-warn/30' : 'bg-bg-panel border-line-table'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🔋</span>
                    <span className="text-[10px] font-bold text-status-warn uppercase tracking-wider">太陽光＋蓄電池</span>
                  </div>
                  {breakEvenBatt > 0 ? (
                    <div className="tabular">
                      <span className="text-xl font-bold text-status-warn">{breakEvenBatt}</span>
                      <span className="text-xs text-ink-sub ml-1">年目で回収完了</span>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-sub">{simY}年内で回収不可</div>
                  )}
                  <div className="text-[10px] text-ink-sub mt-1">初期投資 -{fmtMan(initCost)}万</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PatternCardV2({ tone, icon, label, baseline, benefitFit, benefitPost }: {
  tone: 'good' | 'normal' | 'bad';
  icon: string;
  label: string;
  baseline: number;          // 電気代（基本の支出）= 太陽光なしの電気代
  benefitFit?: number;       // 発電量による利益（FIT中）. undefined なら「何もなし」
  benefitPost?: number;      // 発電量による利益（FIT後）
}) {
  const headCls = tone === 'good' ? 'bg-status-ok/10 border-status-ok/30 text-status-ok'
    : tone === 'bad' ? 'bg-status-danger/10 border-status-danger/30 text-status-danger'
    : 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue';
  const bodyCls = tone === 'good' ? 'bg-status-ok/5'
    : tone === 'bad' ? 'bg-status-danger/5'
    : 'bg-accent-blue/5';

  const hasBenefit = benefitFit !== undefined;
  const totalFit  = hasBenefit ? baseline - benefitFit  : baseline;
  const totalPost = hasBenefit && benefitPost !== undefined ? baseline - benefitPost : baseline;
  // 合計光熱費の表示色（プラス=赤系、マイナス=緑系=収益化）
  const totalColor = (v: number) => v < 0 ? 'text-status-ok' : 'text-ink-main';

  // 「何もなし」: 電気代だけシンプル表示
  if (!hasBenefit) {
    return (
      <div className={`rounded-[10px] border overflow-hidden ${headCls}`}>
        <div className="px-3 py-2 text-center">
          <div className="text-xl">{icon}</div>
          <div className="text-[11px] font-bold tracking-wider">{label}</div>
        </div>
        <div className={`${bodyCls} px-3 py-5 text-center border-t border-current/20`}>
          <div className="text-[10px] text-ink-sub">電気代</div>
          <div className="text-2xl font-bold tabular leading-none mt-1 text-ink-main">
            {fmt(baseline, 2)}<span className="text-xs font-normal text-ink-sub ml-1">万円/月</span>
          </div>
          <div className="text-[10px] text-ink-sub mt-2">発電設備なし</div>
        </div>
      </div>
    );
  }

  // 太陽光（蓄電池）あり: 電気代 → 発電利益 → 合計光熱費 の3行構成
  return (
    <div className={`rounded-[10px] border overflow-hidden ${headCls}`}>
      {/* ヘッダー */}
      <div className="px-3 py-2 text-center">
        <div className="text-xl">{icon}</div>
        <div className="text-[11px] font-bold tracking-wider">{label}</div>
      </div>
      {/* 内訳: 電気代 - 発電利益 */}
      <div className="bg-bg-card px-3 py-2.5 border-t border-current/20">
        <div className="text-[11px] space-y-1">
          <div className="flex justify-between">
            <span className="text-ink-sub">電気代（基本の支出）</span>
            <span className="tabular text-ink-main font-medium">{fmt(baseline, 2)} 万</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-sub">発電量による利益</span>
            <span className="tabular text-status-ok font-bold">+{fmt(benefitFit, 2)} 万</span>
          </div>
        </div>
      </div>
      {/* 合計光熱費 (FIT中) */}
      <div className={`${bodyCls} px-3 py-3 text-center border-t border-current/20`}>
        <div className="text-[10px] text-ink-sub">合計の光熱費（FIT中）</div>
        <div className={`text-2xl font-bold tabular leading-none mt-1 ${totalColor(totalFit)}`}>
          {fmt(totalFit, 2)}<span className="text-xs font-normal text-ink-sub ml-1">万円/月</span>
        </div>
        {totalFit < 0 && (
          <div className="text-[10px] font-bold text-status-ok mt-1">✨ 発電量が電気代を上回ります</div>
        )}
      </div>
      {/* FIT終了後 */}
      <div className="bg-bg-card px-3 py-2 border-t border-line-table">
        <div className="text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span className="text-ink-sub">発電量による利益（FIT後）</span>
            <span className="tabular text-status-ok">+{fmt(benefitPost ?? 0, 2)} 万</span>
          </div>
          <div className="border-t border-line-table pt-1 mt-1 flex justify-between font-semibold">
            <span className="text-ink-sub">合計の光熱費（FIT後）</span>
            <span className={`tabular ${totalColor(totalPost)}`}>{fmt(totalPost, 2)} 万</span>
          </div>
        </div>
      </div>
    </div>
  );
}
