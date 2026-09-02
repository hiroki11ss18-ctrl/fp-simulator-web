import { Card, NumInput, StatBox } from '../ui';
import type { SimData, MaintItem } from '../../types';
import { fmtMan } from '../../lib/format';

// 太陽光関連の固定項目（編集は太陽光タブ側）
type LinkedItem = { id: string; name: string; cycleYears: number; cost: number; note: string };

export default function Maintenance({ data, update }: { data: SimData; update: (p: Partial<SimData>) => void }) {
  const items = data.maint.items;
  const s = data.solar;
  const set = (its: MaintItem[]) => update({ maint: { items: its } });
  const upd = (id: string, patch: Partial<MaintItem>) => set(items.map(i => i.id === id ? { ...i, ...patch } : i));

  // 太陽光連動の3項目
  const linked: LinkedItem[] = s.enabled ? [
    { id: 'powercon', name: '🔧 パワコン交換', cycleYears: s.powerconCycle, cost: s.powerconCost, note: '🔗 太陽光タブ' },
    { id: 'solarchk', name: '☀️ 太陽光点検・清掃', cycleYears: s.solarMaintCycle, cost: s.solarMaintCost, note: '🔗 太陽光タブ' },
    ...(s.battEnabled ? [{ id: 'battery', name: '🔋 蓄電池交換', cycleYears: s.battReplaceCycle, cost: s.battReplaceCost, note: '🔗 太陽光タブ' }] : []),
  ] : [];

  // 期間（30年・60年）合計
  const calcSum = (years: number) => {
    let total = 0;
    for (const it of items) {
      if (!it.enabled || it.cycleYears <= 0) continue;
      for (let y = it.cycleYears; y <= years; y += it.cycleYears) total += it.cost;
    }
    for (const it of linked) {
      if (it.cycleYears <= 0) continue;
      for (let y = it.cycleYears; y <= years; y += it.cycleYears) total += it.cost;
    }
    return total;
  };

  const period = data.simYears;
  const totalInPeriod = calcSum(period);
  const yearAvg = period > 0 ? totalInPeriod / period : 0;
  const monthAvg = yearAvg / 12;

  // タイムライン（5年刻みでイベント集計）
  type Event = { year: number; name: string; cost: number };
  const events: Event[] = [];
  for (const it of items) {
    if (!it.enabled || it.cycleYears <= 0) continue;
    for (let y = it.cycleYears; y <= period; y += it.cycleYears) events.push({ year: y, name: it.name, cost: it.cost });
  }
  for (const it of linked) {
    if (it.cycleYears <= 0) continue;
    for (let y = it.cycleYears; y <= period; y += it.cycleYears) events.push({ year: y, name: it.name, cost: it.cost });
  }
  events.sort((a, b) => a.year - b.year);
  // 5年単位にグルーピング
  const buckets: { range: string; from: number; to: number; events: Event[]; total: number }[] = [];
  for (let from = 1; from <= period; from += 5) {
    const to = Math.min(from + 4, period);
    const evs = events.filter(e => e.year >= from && e.year <= to);
    if (evs.length === 0) continue;
    buckets.push({ range: `${from}〜${to}年目`, from, to, events: evs, total: evs.reduce((a, e) => a + e.cost, 0) });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label={`${period}年メンテ総額`} value={fmtMan(totalInPeriod)} tone="bad" />
        <StatBox label="年平均" value={fmtMan(yearAvg)} tone="normal" />
        <StatBox label="月平均" value={fmtMan(monthAvg)} suffix="万円/月" tone="normal" />
        <StatBox label="60年総額（参考）" value={fmtMan(calcSum(60))} tone="normal" />
      </div>

      <Card title="🔧 メンテナンス項目">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-ink-label border-b border-line-table">
                <th className="py-2 pr-2 w-10">有効</th>
                <th className="py-2 pr-2">項目</th>
                <th className="py-2 pr-2 text-right">実施目安（年ごと）</th>
                <th className="py-2 pr-2 text-right">概算費用（万円）</th>
                <th className="py-2 pr-2">備考</th>
                <th className="py-2 pr-2 text-right">{period}年間合計</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const cnt = it.enabled && it.cycleYears > 0 ? Math.floor(period / it.cycleYears) : 0;
                return (
                  <tr key={it.id} className="border-b border-line-table hover:bg-bg-panel/40">
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={it.enabled} onChange={e => upd(it.id, { enabled: e.target.checked })} />
                    </td>
                    <td className="py-2 pr-2 font-medium text-ink-main">{it.name}</td>
                    <td className="py-2 pr-2 w-32"><NumInput value={it.cycleYears} onChange={v => upd(it.id, { cycleYears: v })} suffix="年" /></td>
                    <td className="py-2 pr-2 w-32"><NumInput value={it.cost} onChange={v => upd(it.id, { cost: v })} suffix="万" /></td>
                    <td className="py-2 pr-2 text-xs text-ink-sub">{cnt > 0 ? `${cnt}回実施` : '—'}</td>
                    <td className="py-2 pr-2 text-right tabular font-medium">{cnt > 0 ? `${fmtMan(cnt * it.cost)} 万円` : '—'}</td>
                  </tr>
                );
              })}
              {linked.map(it => {
                const cnt = it.cycleYears > 0 ? Math.floor(period / it.cycleYears) : 0;
                return (
                  <tr key={it.id} className="border-b border-line-table bg-bg-panel/20">
                    <td className="py-2 pr-2 text-center">🔗</td>
                    <td className="py-2 pr-2 font-medium text-ink-main">{it.name}</td>
                    <td className="py-2 pr-2 text-right text-ink-sub tabular">{it.cycleYears} 年</td>
                    <td className="py-2 pr-2 text-right text-ink-sub tabular">{fmtMan(it.cost)} 万</td>
                    <td className="py-2 pr-2 text-xs text-ink-sub">{it.note}</td>
                    <td className="py-2 pr-2 text-right tabular font-medium">{cnt > 0 ? `${fmtMan(cnt * it.cost)} 万円` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-sub mt-3">※ 🔗マーク（パワコン・太陽光点検・蓄電池）は「太陽光・蓄電池」シートで設定し、ここに自動反映されます。</p>
      </Card>

      <Card title="📅 メンテナンス タイムライン（5年刻み）">
        {buckets.length === 0 && <div className="text-sm text-ink-sub">期間中のメンテ予定はありません。</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {buckets.map(b => (
            <div key={b.range} className="bg-bg-panel rounded-[8px] p-4">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-xs font-bold text-ink-label">{b.range}</div>
                <div className="tabular font-bold text-ink-main">{fmtMan(b.total)} <span className="text-xs font-normal text-ink-sub">万円</span></div>
              </div>
              <ul className="space-y-1 text-xs">
                {b.events.map((e, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-ink-main">{e.year}年目: {e.name}</span>
                    <span className="tabular text-ink-sub">{fmtMan(e.cost)}万</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
