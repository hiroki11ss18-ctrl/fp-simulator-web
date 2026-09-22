import type { SimData, CalcResult, YearRow } from '../types';
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
      <tr><th>条件悪化時の手元資金</th>{overview.horizonRows.map(r => <td className={r.stressBalance < 0 ? 'negative' : ''} key={r.years}>{fmt(r.stressBalance)}万円</td>)}</tr>
      <tr><th>条件悪化時の最低残高</th>{overview.horizonRows.map(r => <td className={r.stressLow < 0 ? 'negative' : ''} key={r.years}>{fmt(r.stressLow)}万円</td>)}</tr>
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

export function BalancePlot({ calc, stress, years = 60 }: { calc: CalcResult; stress?: CalcResult; years?: number }) {
  const w = 720, h = 210, left = 62, right = 15, top = 12, bottom = 30;
  const points = [{ year: 0, balance: calc.initialCash }, ...calc.rows.slice(0, years)];
  const alt = stress ? [{ year: 0, balance: stress.initialCash }, ...stress.rows.slice(0, years)] : [];
  const all = [...points, ...alt].map(p => p.balance);
  const low = Math.min(0, ...all), high = Math.max(1, ...all);
  const pad = Math.max(10, (high - low) * 0.08), min = low - pad, max = high + pad;
  const x = (year: number) => left + year / years * (w - left - right);
  const y = (value: number) => top + (max - value) / (max - min) * (h - top - bottom);
  const path = (rows: typeof points) => rows.map((p, i) => (i ? 'L' : 'M') + x(p.year).toFixed(2) + ',' + y(p.balance).toFixed(2)).join(' ');
  return <div className="balance-plot"><svg viewBox={'0 0 ' + w + ' ' + h} role="img" aria-label="購入直後から将来までの手元資金。青は基本条件、赤の破線は条件悪化時。金額の詳細は年次表。">
    {[min + pad, (low + high) / 2, high].map((value, i) => <g key={i}><line x1={left} x2={w - right} y1={y(value)} y2={y(value)} stroke="#e1e5e8" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#5b636d">{fmt(value)}</text></g>)}
    <line x1={left} x2={w - right} y1={y(0)} y2={y(0)} stroke="#9da7ac" />
    {Array.from({ length: years / 10 + 1 }, (_, i) => i * 10).map(year => <text key={year} x={x(year)} y={h - 6} textAnchor="middle" fontSize="11" fill="#5b636d">{year}年</text>)}
    <path d={path(points)} fill="none" stroke="#287abe" strokeWidth="2.5" />
    {stress && <path d={path(alt)} fill="none" stroke="#b84e46" strokeWidth="2" strokeDasharray="5 4" />}
  </svg><div className="chart-key"><span>基本条件</span>{stress && <span>条件悪化時</span>}<small>単位：万円</small></div></div>;
}

export function AssumptionText({ data }: { data: SimData }) {
  return <p className="plan-note">条件悪化の比較：借入前の全期間の設定金利＋{fmt(data.stress.rateAdd, 2)}ポイント、給与・賞与−{fmt(data.stress.incomeDropPct)}%、生活・光熱・保険・教育・修繕・予定支出＋{fmt(data.stress.expenseAddPct)}%。住宅価格・初期設備費・他ローン・積立保険・退職金は変更しません。手入力年金は同額、簡易年金は減収後の年収で再推計。将来予測ではなく条件比較です。</p>;
}
