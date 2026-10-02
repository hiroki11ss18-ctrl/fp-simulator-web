import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, NumInput, Select, TextInput } from '../ui';
import type { SimData, MaintItem, CalcResult } from '../../types';
import { fmt } from '../../lib/format';

export default function Maintenance({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const items = data.maint.items;
  const [comparisonYears, setComparisonYears] = useState(data.simYears === 30 ? 60 : data.simYears);
  const set = (values: MaintItem[]) => update({ maint: { items: values } });
  const patch = (id: string, values: Partial<MaintItem>) => set(items.map(i => i.id === id ? { ...i, ...values } : i));
  const thirtyTotal = calc.rows.slice(0, 30).reduce((a, r) => a + r.maintCost, 0);
  const total = calc.rows.slice(0, comparisonYears).reduce((a, r) => a + r.maintCost, 0);
  return <div className="plan-layout">
    <section className="plan-section">
      <div className="section-heading"><h2>住まいを維持するための予算</h2>
        <Field label="比較する期間"><Select value={comparisonYears} onChange={setComparisonYears} options={([40, 50, 60] as const).map(value => ({ value, label: value + '年間' }))} /></Field>
      </div>
      <div className="metric-grid">
        <div className="metric"><span>30年間の修繕・設備更新 累計</span><strong>{fmt(thirtyTotal)}<small>万円</small></strong></div>
        <div className="metric"><span>{comparisonYears}年間の修繕・設備更新 累計</span><strong>{fmt(total)}<small>万円</small></strong></div>
        <div className="metric"><span>{comparisonYears}年間で備える月々の積立目安</span><strong>{fmt(total / comparisonYears / 12, 2)}<small>万円/月</small></strong></div>
      </div>
      <p className="plan-note">購入から各期間の年末までに支払う費用の合計です。30年目・{comparisonYears}年目の支出と、物価上昇率 {data.household.inflationRate}%/年を含みます。積立目安は比較期間の総額を月割りしたもので、手元資金から重ねて差し引きません。</p>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>建物・設備のメンテナンス</h2><button className="action-button" onClick={() => set([...items, { id: crypto.randomUUID(), name: '', cycleYears: 10, cost: 0, enabled: true }])}><Plus size={16} />項目を追加</button></div>
      {items.map(item => <div className="maintenance-row" key={item.id}>
        <label className="check-cell"><input aria-label={item.name + 'を計上'} type="checkbox" checked={item.enabled} onChange={e => patch(item.id, { enabled: e.target.checked })} />計上</label>
        <Field label="項目"><TextInput value={item.name} onChange={name => patch(item.id, { name })} /></Field>
        <Field label="実施間隔（0はなし）"><NumInput value={item.cycleYears} onChange={cycleYears => patch(item.id, { cycleYears: Math.round(cycleYears) })} step={1} max={60} suffix="年" /></Field>
        <Field label="1回の費用（現在価格）"><NumInput value={item.cost} onChange={cost => patch(item.id, { cost })} step={1} suffix="万円" /></Field>
        <button className="icon-button danger" title="メンテナンス項目を削除" onClick={() => set(items.filter(i => i.id !== item.id))}><Trash2 size={17} /></button>
      </div>)}
      <p className="plan-note">費用・周期は仮予算です。メーカー仕様・保証条件・地域の施工見積で確認してください。</p>
    </section>
    <section className="plan-section">
      <h2>修繕・更新の予定年（{comparisonYears}年間）</h2>
      <div className="table-scroll"><table className="plan-table"><thead><tr><th>経過年</th><th>世帯主年齢</th><th>予定</th><th>その年の支出</th></tr></thead><tbody>
        {calc.rows.slice(0, comparisonYears).filter(r => r.maintCost > 0).map(r => <tr key={r.year}>
          <th>{r.year}年後</th><td>{r.age}歳</td><td>{items.filter(i => i.enabled && i.cycleYears > 0 && r.year % Math.max(1, Math.round(i.cycleYears)) === 0).map(i => i.name).join(' / ')}</td><td>{fmt(r.maintCost, 1)}万円</td>
        </tr>)}
      </tbody></table></div>
    </section>
  </div>;
}
