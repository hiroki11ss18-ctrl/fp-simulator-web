import { Field, NumInput, Select, Toggle } from '../ui';
import type { SimData, CalcResult, SolarBattery as Solar } from '../../types';
import { fmt } from '../../lib/format';
import { energyYear, solarMaintenance, solarMonthlyGenArr, HOUSEHOLD_ENERGY, ENERGY_SOURCE } from '../../lib/energy';
import { BarChart, Bar, LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function SolarBattery({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const s = data.solar;
  const set = (patch: Partial<Solar>) => update({ solar: { ...s, ...patch } });
  const energy = energyYear(data);
  const gen = solarMonthlyGenArr(s);
  const field = (key: keyof Solar, label: string, suffix: string, step = 0.1, max?: number) =>
    <Field label={label}><NumInput value={s[key] as number} onChange={v => set({ [key]: /年/.test(suffix) && step === 1 ? Math.round(v) : v })} suffix={suffix} step={step} min={key === 'panelLifeYears' ? 1 : 0} max={max} /></Field>;
  let cumul = -calc.solarInitial;
  const roi = [{ year: 0, balance: cumul }, ...calc.rows.slice(0, data.simYears).map(r => {
    cumul += r.solarSaving + r.solarSale - solarMaintenance(s, r.year) * (1 + data.household.inflationRate / 100) ** (r.year - 1);
    return { year: r.year, balance: cumul };
  })];
  const recovered = roi.find(r => r.balance >= 0 && r.year > 0);
  return <div className="plan-layout">
    <section className="plan-section">
      <div className="section-heading"><h2>電気使用量・料金</h2><span>電気明細の使用量（kWh）</span></div>
      <div className="form-grid">
        {field('monthlyUsage', '月間電気使用量', 'kWh/月', 10)}
        {field('dayUsageRatio', '昼間の使用割合', '%', 5, 100)}
        {field('elecPriceDay', '昼間の買電単価', '円/kWh')}
        {field('elecPriceNight', '夜間の買電単価', '円/kWh')}
        {field('baseChargeMonthly', '毎月の基本料金等', '万円/月')}
        <Field label="導入前の電気代（手入力優先）">
          <NumInput value={calc.effectiveElecBill} onChange={v => update({ solar: { ...s, elecBillManual: v }, household: { ...data.household, electricMonthly: 0 } })} suffix="万円/月" step={0.1} />
          <button className="text-xs text-accent-blue mt-1" onClick={() => update({ solar: { ...s, elecBillManual: null }, household: { ...data.household, electricMonthly: 0 } })}>使用量からの計算に戻す</button>
        </Field>
      </div>
      <div className="reference-table mt-5"><h3>世帯人数別の平均使用量</h3>
        <div className="table-scroll"><table className="plan-table"><thead><tr><th>世帯人数</th>{HOUSEHOLD_ENERGY.map(p => <th key={p.people}>{p.label}</th>)}</tr></thead>
          <tbody><tr><th>月平均（約kWh）</th>{HOUSEHOLD_ENERGY.map(p => <td key={p.people}><button className="value-preset" title={p.label + 'の全国平均を入力'} onClick={() => set({ monthlyUsage: p.monthlyKwh })}>{p.monthlyKwh}</button></td>)}</tr></tbody>
        </table></div>
        <p className="plan-note"><a href={ENERGY_SOURCE} target="_blank" rel="noreferrer">環境省 令和5年度家庭CO2統計・確報 図1-62</a>（2025年6月公表）。図の年間GJ表示値を1kWh＝0.0036GJとして12か月で割った概数。全国の戸建・集合住宅・ガス併用等を含み、オール電化住宅専用の平均ではありません。地域・断熱・在宅時間で変わります。</p>
      </div>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>導入設備と購入費</h2><Toggle checked={s.enabled} onChange={enabled => set({ enabled })} label="太陽光を導入" /></div>
      <div className="form-grid">
        {field('solarKw', '太陽光パネル容量', 'kW')}
        {field('powerconKw', 'パワコン容量', 'kW')}
        {field('solarCost', '太陽光の初期費用', '万円', 1)}
        <Field label="設備費の支払い"><Select value={s.funding} onChange={funding => set({ funding })} options={[
          { value: 'included', label: '建物等の見積に含む' }, { value: 'cash', label: '別途・現金で支払う' }, { value: 'loan', label: '別途・住宅ローンに加算' },
        ]} /></Field>
      </div>
      <div className="mt-5 mb-3"><Toggle checked={s.battEnabled} onChange={battEnabled => set({ battEnabled })} label="蓄電池を導入（太陽光と併用）" /></div>
      {s.battEnabled && <div className="form-grid">
        {field('battCapacity', '蓄電池の実効容量', 'kWh')}
        {field('battCost', '蓄電池の初期費用', '万円', 1)}
        {field('batteryEfficiencyPct', '充放電効率（仮定）', '%', 1, 100)}
      </div>}
      <p className="plan-note">初期費用 {fmt(calc.solarInitial)}万円。建物等に含む場合は重ねて加算しません。蓄電池は余剰発電から充電し、夜の消費を賄うモデルです。夜間買電からの充電・時間帯ごとの制御・売電抑制は含みません。</p>
    </section>
    <section className="plan-section">
      <h2>発電量・売電契約</h2>
      <div className="form-grid">
        {field('generationYield', '容量1kWあたり年間発電量', 'kWh/年', 10)}
        {field('genAnnualKwh', '年間発電量の見積値（0は自動）', 'kWh/年', 10)}
        {field('degradationPct', '年間の発電量低下（仮定）', '%/年', 0.1, 100)}
        {field('fitRate', '売電単価・第1段階', '円/kWh')}
        {field('fitStepYears', '第1段階の終了', '年後', 1, 60)}
        {field('fitRateMiddle', '売電単価・第2段階', '円/kWh')}
        {field('fitYears', 'FIT期間の終了', '年後', 1, 60)}
        {field('fitRateAfter', 'FIT終了後の売電単価（仮定）', '円/kWh')}
      </div>
      <button className="action-button mt-4" onClick={() => set({ fitRate: 24, fitStepYears: 4, fitRateMiddle: 8.3, fitYears: 10 })}>2026年度・住宅用10kW未満のFIT目安を適用</button>
      <p className="plan-note">自動発電量の初期値は<a href="https://www.jpea.gr.jp/faq/563/" target="_blank" rel="noreferrer">JPEAの年間約1,000kWh/kWの目安</a>。方位・勾配・出雲の積雪等を織り込む設置業者の発電見積を優先してください。<a href="https://www.meti.go.jp/press/2025/03/20260319004/20260319004.html" target="_blank" rel="noreferrer">2026年度の住宅用FIT</a>は1〜4年目24円・5〜10年目8.3円。適用の可否は認定時期・設備区分で確認。FIT終了後の単価は仮定です。同一単価の契約は第1段階の終了をFIT期間の終了と同じ年に設定します。</p>
      <details><summary>月別発電量・自家消費率の詳細</summary>
        <div className="mt-4 mb-3"><Toggle checked={s.genAuto} onChange={genAuto => set({ genAuto })} label="月別発電量を年間値から配分" /></div>
        <div className="form-grid dense">{gen.map((v, i) => <Field label={(i + 1) + '月の発電量'} key={i}>
          <NumInput value={Math.round(v)} onChange={value => { const next = [...gen]; next[i] = value; set({ genM: next, genAuto: false }); }} suffix="kWh" step={10} />
        </Field>)}</div>
        <div className="mt-4 mb-3"><Toggle checked={s.selfRateManual} onChange={selfRateManual => set({ selfRateManual })} label="自家消費率の目標を手入力" /></div>
        {s.selfRateManual && <div className="form-grid">{field('selfRateSolar', '直接自家消費の目標', '%', 1, 100)}{field('selfRateBatt', '蓄電池込み自家消費の目標', '%', 1, 100)}</div>}
        <p className="plan-note">手入力の率でも、使用量・昼夜の需要・実効容量・充放電効率を超える節電は計上しません。</p>
      </details>
    </section>
    <section className="plan-section">
      <h2>点検・交換・長期更新</h2>
      <div className="form-grid dense">
        {field('powerconCost', 'パワコン交換費', '万円', 1)}
        {field('powerconCycle', 'パワコン交換間隔', '年', 1, 60)}
        {field('solarMaintCost', '点検・清掃費', '万円', 1)}
        {field('solarMaintCycle', '点検間隔', '年', 1, 60)}
        {s.battEnabled && <>{field('battReplaceCost', '蓄電池交換費', '万円', 1)}{field('battReplaceCycle', '蓄電池交換間隔', '年', 1, 60)}</>}
        {field('panelLifeYears', 'パネルの利用年数（仮定）', '年', 1, 60)}
        {field('panelReplaceCost', 'パネル更新費（パワコン別）', '万円', 1)}
      </div>
      <div className="mt-4"><Toggle checked={s.panelReplace} onChange={panelReplace => set({ panelReplace })} label="利用年数ごとにパネルを更新する" /></div>
      <p className="plan-note">更新しない場合、利用年数経過後の発電と設備メンテナンスを止めます。蓄電池交換間隔0の場合は15年後から蓄電効果0の仮定。保証や実寿命を表す数値ではありません。撤去処分費は予定支出に別途計上してください。</p>
    </section>
    <section className="plan-section">
      <h2>初年度の効果</h2>
      <div className="metric-grid">
        <div className="metric"><span>年間発電量</span><strong>{fmt(energy.generation)}<small>kWh</small></strong></div>
        <div className="metric"><span>電気代（節電後）</span><strong>{fmt(energy.afterMonthly, 2)}<small>万円/月</small></strong></div>
        <div className="metric"><span>節電額</span><strong>{fmt(energy.saving, 1)}<small>万円/年</small></strong></div>
        <div className="metric"><span>売電収入</span><strong>{fmt(energy.sale, 1)}<small>万円/年</small></strong></div>
      </div>
      <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={energy.months}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickFormatter={v => v + '月'} /><YAxis width={48} /><Tooltip formatter={(v: number) => fmt(v, 1) + ' kWh'} /><Legend />
        <Bar dataKey="direct" stackId="energy" name="直接使用" fill="#237f68" /><Bar dataKey="delivered" stackId="energy" name="蓄電池から使用" fill="#3280c5" />
        <Bar dataKey="sold" stackId="energy" name="売電" fill="#b88729" /><Bar dataKey="loss" stackId="energy" name="充放電損失" fill="#b8bec2" />
      </BarChart></ResponsiveContainer></div>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>設備単体の累積収支</h2><span>{recovered ? '最初の回収目安 ' + recovered.year + '年目' : '期間内の回収なし'}</span></div>
      <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={roi}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" tickFormatter={v => v + '年'} /><YAxis width={60} /><Tooltip formatter={(v: number) => fmt(v) + '万円'} /><ReferenceLine y={0} stroke="#9da7ac" />
        <Line dataKey="balance" name="累積収支" stroke="#237f68" dot={false} strokeWidth={2} />
      </LineChart></ResponsiveContainer></div>
      <p className="plan-note">初期費用を差し引き、節電・売電を加え、点検・交換・パネル更新費を引いた収支。借入利息・税・補助金はこの設備比較に含みません。更新時に再びマイナスになる場合もあります。家計全体の残高は総合まとめをご確認ください。</p>
    </section>
  </div>;
}
