import type { CalcResult, YearRow } from '../types';
import { buildOverview } from '../lib/planning';
import { fmt } from '../lib/format';
export type Overview = ReturnType<typeof buildOverview>;

export function HorizonTable({ overview }: { overview: Overview }) {
  return <div className="table-scroll"><table className="plan-table horizon-table">
    <thead><tr><th>購入からの経過</th>{overview.horizonRows.map(r => <th key={r.years}>{r.years}年後<small>世帯主 {r.age}歳</small></th>)}</tr></thead>
    <tbody>
      <tr className="strong-row"><th>手元資金</th>{overview.horizonRows.map(r => <td className={r.balance < 0 ? 'negative' : ''} key={r.years}>{fmt(r.balance)}<small>万円</small></td>)}</tr>
      <tr><th>残る借入残高</th>{overview.horizonRows.map(r => <td key={r.years}>{fmt(r.debt)}万円</td>)}</tr>
      <tr><th>途中の最低残高</th>{overview.horizonRows.map(r => <td className={r.low.balance < 0 ? 'negative' : ''} key={r.years}>{fmt(r.low.balance)}万円<small>{r.low.year === 0 ? '購入直後' : r.low.year + '年後・' + r.low.age + '歳'}</small></td>)}</tr>
      <tr><th>最初の資金不足</th>{overview.horizonRows.map(r => <td key={r.years}>{r.deficit === null ? '年末時点ではなし' : r.deficit === 0 ? '購入時' : r.deficit + '年後'}</td>)}</tr>
    </tbody>
  </table></div>;
}

export function MoneyBridge({ calc, years }: { calc: CalcResult; years: number }) {
  const rows = calc.rows.slice(0, years);
  const income = rows.reduce((a, r) => a + r.income + r.solarSale, 0);
  const spending = rows.reduce((a, r) => a + r.totalOut, 0);
  return <div className="money-bridge">
    <div><span>現在の貯蓄</span><strong>{fmt(calc.initialSavings)}万円</strong></div><b>−</b>
    <div><span>購入時の現金支出</span><strong>{fmt(calc.cashRequired)}万円</strong></div><b>＋</b>
    <div><span>{years}年間の収入</span><strong>{fmt(income)}万円</strong></div><b>−</b>
    <div><span>{years}年間の支出</span><strong>{fmt(spending)}万円</strong></div><b>＝</b>
    <div><span>{years}年後の手元資金</span><strong className={rows[years - 1].balance < 0 ? 'negative' : ''}>{fmt(rows[years - 1].balance)}万円</strong></div>
  </div>;
}

export function MonthlyBudget({ overview }: { overview: Overview }) {
  return <table className="plan-table budget-table"><tbody>
    <tr><th>初年度の手取り収入・年金・売電（月平均）</th><td>{fmt(overview.regularIncome, 2)}万円</td></tr>
    {overview.monthlyItems.map(i => <tr key={i.label}><th>{i.label}</th><td>−{fmt(i.amount, 2)}万円</td></tr>)}
    <tr className="strong-row"><th>支払い・積立後の月平均余力</th><td className={overview.monthlySurplus < 0 ? 'negative' : ''}>{fmt(overview.monthlySurplus, 2)}万円</td></tr>
  </tbody></table>;
}

export function LifeStageExpenses({ overview }: { overview: Overview }) {
  const stages = overview.lifeStages;
  const columns = [stages.working, stages.retired];
  return <div className="life-stage-expenses">
    <table className="plan-table life-stage-table">
      <caption>{stages.years}年間の試算 / 各期間の月平均・万円</caption>
      <thead><tr><th scope="col">支出の内訳</th>{columns.map((stage, i) => <th scope="col" key={i}>
        {i === 0 ? '現役中' : '退職後'}
        <small>{stage ? `世帯主 ${stage.startAge}〜${stage.endAge}歳` : '対象期間なし'}</small>
        {stage && <><small>{stage.firstYear}〜{stage.lastYear}年目</small><small>{stage.years}年間</small></>}
      </th>)}</tr></thead>
      <tbody>{stages.labels.map((label, i) => <tr key={label}><th scope="row">{label}</th>
        {columns.map((stage, j) => <td key={j}>{stage ? fmt(stage.amounts[i], 2) : '対象なし'}</td>)}
      </tr>)}
        <tr className="strong-row"><th scope="row">月平均の支出合計</th>{columns.map((stage, i) => <td key={i}>{stage ? fmt(stage.monthlyTotal, 2) : '対象なし'}</td>)}</tr>
        <tr><th scope="row">期間中の支出合計</th>{columns.map((stage, i) => <td key={i}>{stage ? fmt(stage.total) : '対象なし'}</td>)}</tr>
      </tbody>
    </table>
    <p className="plan-note">{stages.years}年間の年次収支を世帯主の退職時点で分けた世帯全体の支出です。年齢は各年の開始時点。各期間の支出総額÷年数÷12で、毎月同じ額を支払う想定ではありません。設定した物価上昇、旅行・車・修繕などの年単位の支出も含みます。</p>
    <p className="plan-note">家計欄の生活費は「現在価格の月額」、この表は「将来の支出を含む期間平均」です。年次残高に平均額を追加して差し引くことはありません。配偶者の就業状況にかかわらず、生活費の切替は世帯主の退職年齢が基準です。</p>
  </div>;
}

export function AnnualTable({ rows, detailed = false }: { rows: YearRow[]; detailed?: boolean }) {
  return <div className="table-scroll"><table className="plan-table annual-table"><thead><tr>
    <th>経過年<br />世帯主年齢</th><th>手取り収入<br />売電含む</th><th>住宅ローン</th>
    {detailed ? <><th>生活・光熱</th><th>教育費</th><th>税金</th><th>修繕・予定</th></> : <th>その他支出</th>}
    <th>年間収支</th><th>年末手元資金</th><th>出来事</th>
  </tr></thead><tbody>{rows.map(r => <tr key={r.year}>
    <th>{r.year}年 / {r.age}歳</th><td>{fmt(r.income + r.solarSale)}</td><td>{fmt(r.loanPay)}</td>
    {detailed ? <><td>{fmt(r.living + r.utility)}</td><td>{fmt(r.eduCost)}</td><td>{fmt(r.propTax)}</td><td>{fmt(r.maintCost + r.sudden)}</td></> : <td>{fmt(r.totalOut - r.loanPay)}</td>}
    <td className={r.net < 0 ? 'negative' : ''}>{fmt(r.net)}</td><td className={r.balance < 0 ? 'negative' : ''}>{fmt(r.balance)}</td><td className="event-cell">{r.events.join(' / ') || ' '}</td>
  </tr>)}</tbody></table></div>;
}

export function BalancePlot({ calc, years = 60 }: { calc: CalcResult; years?: number }) {
  const w = 720, h = 210, left = 62, right = 15, top = 12, bottom = 30;
  const points = [{ year: 0, balance: calc.initialCash }, ...calc.rows.slice(0, years)];
  const all = points.map(p => p.balance);
  const low = Math.min(0, ...all), high = Math.max(1, ...all);
  const pad = Math.max(10, (high - low) * 0.08), min = low - pad, max = high + pad;
  const x = (year: number) => left + year / years * (w - left - right);
  const y = (value: number) => top + (max - value) / (max - min) * (h - top - bottom);
  const path = (rows: typeof points) => rows.map((p, i) => (i ? 'L' : 'M') + x(p.year).toFixed(2) + ',' + y(p.balance).toFixed(2)).join(' ');
  return <div className="balance-plot"><svg viewBox={'0 0 ' + w + ' ' + h} role="img" aria-label="基本条件での購入直後から将来までの手元資金。金額の詳細は年次表。">
    {[min + pad, (low + high) / 2, high].map((value, i) => <g key={i}><line x1={left} x2={w - right} y1={y(value)} y2={y(value)} stroke="#e1e5e8" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#5b636d">{fmt(value)}</text></g>)}
    <line x1={left} x2={w - right} y1={y(0)} y2={y(0)} stroke="#9da7ac" />
    {Array.from({ length: years / 10 + 1 }, (_, i) => i * 10).map(year => <text key={year} x={x(year)} y={h - 6} textAnchor="middle" fontSize="11" fill="#5b636d">{year}年</text>)}
    <path d={path(points)} fill="none" stroke="#287abe" strokeWidth="2.5" />
  </svg><div className="chart-key"><span>基本条件</span><small>単位：万円</small></div></div>;
}
