import { forwardRef, useMemo } from 'react';
import type { SimData, CalcResult } from '../types';
import { fmt } from '../lib/format';
import { buildOverview, buildExpenseTotals } from '../lib/planning';
import { PROPOSAL_STYLES } from '../lib/proposalStyles';
import { HorizonTable, MoneyBridge, BalancePlot, AnnualTable } from './PlanResults';

const PrintProposal = forwardRef<HTMLDivElement, { data: SimData; calc: CalcResult }>(({ data, calc }, ref) => {
  const view = useMemo(() => buildOverview(data, calc), [data, calc]);
  const expenses = useMemo(() => buildExpenseTotals(data, calc), [data, calc]);
  const b = data.basic;
  const chunks = [0, 20, 40].map(start => calc.rows.slice(start, start + 20));
  return <div ref={ref} className="fp-proposal">
    <style dangerouslySetInnerHTML={{ __html: PROPOSAL_STYLES }} />
    <section className="proposal-page">
      <header className="proposal-header"><div><p className="proposal-subtitle">住まいと暮らしの資金計画</p><h1>ライフプラン提案書</h1><p>{b.customerName || 'お客様名未入力'} 様 / 担当 {b.staffName || '未入力'} / {b.date}</p></div></header>
      <div className="metric-grid">
        <div className="metric"><span>購入直後の手元資金</span><strong className={calc.initialCash < 0 ? 'negative' : ''}>{fmt(calc.initialCash)}<small>万円</small></strong></div>
        <div className="metric"><span>支払い・積立後の月平均余力</span><strong className={view.monthlySurplus < 0 ? 'negative' : ''}>{fmt(view.monthlySurplus, 2)}<small>万円</small></strong></div>
        <div className="metric"><span>{data.simYears}年後の手元資金</span><strong className={view.selected.balance < 0 ? 'negative' : ''}>{fmt(view.selected.balance)}<small>万円</small></strong></div>
      </div>
      <h2>30・40・50・60年後の見通し</h2><HorizonTable overview={view} />
      <h2>手元資金の推移</h2><BalancePlot calc={calc} />
      <MoneyBridge calc={calc} years={data.simYears} />
      <p className="plan-note">預貯金として残るお金の試算です。不動産売却価値や未受取の保険積立は含みません。残る借入は別表示。マイナスは資金不足で、追加融資は自動計上しません。年末時点の計算のため、年内の大きな支払いへの備えは別途必要です。</p>
      <footer className="proposal-footer">金額は万円・表示のみ四捨五入。入力条件に基づく概算で、将来の収支を保証するものではありません。FPシミュレーター 計算仕様2026.10</footer>
    </section>
    <section className="proposal-page expense-totals-page">
      <header className="proposal-header"><div><h2>{expenses.years}年間の支出総額・内訳</h2><p>{b.customerName || 'お客様'} 様 / 購入後1〜{expenses.years}年目末</p></div><span>単位：万円</span></header>
      <div className="metric-grid">
        <div className="metric"><span>{expenses.years}年間の支出合計</span><strong>{fmt(expenses.periodTotal)}<small>万円</small></strong></div>
        <div className="metric"><span>購入時の現金支出</span><strong>{fmt(expenses.purchaseCash)}<small>万円</small></strong></div>
        <div className="metric"><span>購入時を含む総支出</span><strong>{fmt(expenses.grandTotal)}<small>万円</small></strong></div>
      </div>
      <table className="plan-table expense-totals-table">
        <thead><tr><th>支出の項目</th><th>含まれる費用</th><th>{expenses.years}年間の合計</th></tr></thead>
        <tbody>{expenses.items.map(item => <tr key={item.key}><th>{item.label}</th><td>{item.detail}</td><td>{fmt(item.amount, 1)}</td></tr>)}</tbody>
        <tfoot><tr className="strong-row"><th colSpan={2}>{expenses.years}年間の支出合計</th><td>{fmt(expenses.periodTotal, 1)}</td></tr></tfoot>
      </table>
      <p className="plan-note">設定した物価上昇率 {data.household.inflationRate}%/年と、退職後の生活費への切替を反映した支出の見込みです。月々の積立目安は重ねて加算していません。車の維持費・自動車保険は「車の費用」に含め、生活費からは除いています。</p>
      <p className="plan-note">購入時の現金支出は住宅の総費用から実借入額を差し引いた額（下限0円）です。借入分は返済時に計上するため、住宅の購入総額をもう一度加算しません。表示は四捨五入のため、内訳の合計に端数差が出る場合があります。</p>
      <footer className="proposal-footer">この集計は選択した{expenses.years}年間が対象です。後続の年次収支は従来どおり60年分を掲載しています。入力条件に基づく概算で、将来の支出を保証するものではありません。</footer>
    </section>
    {chunks.map((rows, i) => <section className="proposal-page" key={i}>
      <header className="proposal-header"><h2>年次収支 / {rows[0].year}〜{rows[rows.length - 1].year}年後</h2><span>単位：万円</span></header>
      <AnnualTable rows={rows} />
      <p className="plan-note">収入＝給与・年金・退職金・保険満期受取（住宅ローン控除は含みません）。住宅ローンには繰上返済を含みます。その他支出＝生活費・他ローン・保険料・光熱費・教育費・税・修繕・予定支出。年齢は各年終了時点。</p>
      <footer className="proposal-footer">{b.customerName || 'お客様'} 様 / {b.date} / 入力条件に基づく年末残高の試算</footer>
    </section>)}
  </div>;
});
PrintProposal.displayName = 'PrintProposal';
export default PrintProposal;
