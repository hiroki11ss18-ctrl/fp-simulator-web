import { useMemo } from 'react';
import { Download, Printer, FileDown, AlertTriangle } from 'lucide-react';
import { Field, NumInput } from '../ui';
import type { SimData, CalcResult } from '../../types';
import { fmt } from '../../lib/format';
import { buildOverview, REVIEW_LABELS } from '../../lib/planning';
import { HorizonTable, MonthlyBudget, MoneyBridge, AnnualTable, BalancePlot, AssumptionText } from '../PlanResults';

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvFor(calc: CalcResult) {
  const header = ['経過年', '年末年齢', '給与手取り', '年金手取り', '退職金', '保険受取', '住宅ローン控除', '売電収入', '住宅ローン返済', '生活費・他ローン・保険', '光熱費（節電後）', '固定資産税等', '教育費', '修繕費', '予定支出', '年間収支', '年末手元資金', '住宅ローン残高', '他ローン残高', '出来事'];
  const cell = (v: string | number) => typeof v === 'number' ? v.toFixed(2) : '"' + (/^[=+\-@\t\r]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"';
  return '\uFEFF' + [header, [0, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', calc.initialCash, calc.loan, '', '購入直後・金額は万円'],
    ...calc.rows.map(r => [r.year, r.age, r.wage, r.pension, r.retBonus, r.insurancePayout, r.taxBack, r.solarSale, r.loanPay, r.living, r.utility, r.propTax, r.eduCost, r.maintCost, r.sudden, r.net, r.balance, r.loanBalance, r.otherLoanBalance, r.events.join(' / ')])].map(row => row.map(cell).join(',')).join('\r\n');
}

export default function Summary({ data, calc, update, onPrint, onExport }: {
  data: SimData; calc: CalcResult; update: (p: Partial<SimData>) => void; onPrint: () => void; onExport: () => void;
}) {
  const view = useMemo(() => buildOverview(data, calc), [data, calc]);
  const longTerm = view.horizonRows[3];
  const low = longTerm.low;
  const danger = low.balance < 0;
  const periodRows = calc.rows.slice(0, data.simYears);
  const incomeItems = [['給与（手取り）', calc.lifeIncWage], ['年金（手取り）', calc.lifeIncPension], ['退職金', calc.lifeIncRetBonus],
    ['保険満期受取', calc.lifeIncSiPayout], ['住宅ローン控除', calc.lifeIncTaxBack], ['売電収入', calc.lifeIncSolar]] as const;
  const expenseItems = [['住宅ローン・繰上返済', calc.lifeExpLoanPay], ['生活費・他ローン・掛捨保険', calc.lifeExpLiving],
    ['積立保険料', calc.lifeExpSiPaid], ['光熱費（節電後）', calc.lifeExpUtility], ['固定資産税等', calc.lifeExpPropTax],
    ['教育・仕送り', calc.lifeExpEdu], ['修繕・設備更新', calc.lifeExpMaint], ['旅行・車等の予定支出', calc.lifeExpSudden]] as const;
  return <div className="plan-layout summary-view">
    <section className="summary-heading">
      <div><p className="eyebrow">住まいと暮らしの資金計画 / {data.basic.date}</p><h1>{data.basic.customerName ? data.basic.customerName + ' 様の総合まとめ' : '総合まとめ'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <button className="action-button primary" onClick={onPrint}><Printer size={16} />提案書・PDF</button>
        <button className="action-button" onClick={onExport}><FileDown size={16} />提案書を保存</button>
      </div>
    </section>
    <div className={'decision-band ' + (danger ? 'risk' : 'neutral')} role="status">
      <AlertTriangle size={22} />
      <div><strong>{danger ? '60年間の途中で資金不足になる見込みです' : view.monthlySurplus < 0 ? '毎月の支払い・積立を見直す必要があります' : '入力条件では60年間の年末残高はプラスです'}</strong>
        <p>{danger ? '最初の不足は' + (longTerm.deficit === 0 ? '購入時点' : longTerm.deficit + '年後') + '。' + (low.year === 0 ? '購入時点' : low.year + '年後・' + low.age + '歳時点') + 'の最低残高は ' + fmt(low.balance) + '万円。借入額・生活費・予定支出を再検討してください。'
          : '年の途中の支払い順序や未入力の支出は含みません。条件悪化時の結果と生活防衛資金も確認してください。'}</p>
        {!view.allConfirmed && <p><strong>前提確認前の試算です。入力条件はお客様の実際の数字とは限りません。</strong></p>}
        {calc.initialCash < view.emergencyFund && <p>購入直後は生活防衛資金の目安を{fmt(view.emergencyFund - calc.initialCash)}万円下回ります。</p>}
      </div>
    </div>
    <section className="plan-section">
      <div className="metric-grid">
        <div className="metric"><span>購入直後の手元資金</span><strong className={calc.initialCash < 0 ? 'negative' : ''}>{fmt(calc.initialCash)}<small>万円</small></strong></div>
        <div className="metric"><span>支払い・積立後の月平均余力</span><strong className={view.monthlySurplus < 0 ? 'negative' : ''}>{fmt(view.monthlySurplus, 2)}<small>万円/月</small></strong></div>
        <div className="metric"><span>{data.simYears}年後の手元資金</span><strong className={view.selected.balance < 0 ? 'negative' : ''}>{fmt(view.selected.balance)}<small>万円</small></strong></div>
        <div className="metric"><span>生活防衛資金の目安（{data.basic.emergencyFundMonths}か月）</span><strong>{fmt(view.emergencyFund)}<small>万円</small></strong></div>
      </div>
      <p className="plan-note">手元資金は預貯金として残る金額の試算。自宅の売却価値・未受取の保険積立・運用益は含みません。マイナスは資金不足額で、追加融資や利息は自動計上しません。生活防衛資金は初年度の月平均支払い・積立額を基準とした目安で、別途支出はしません。</p>
    </section>
    <section className="plan-section"><h2>30・40・50・60年後の見通し</h2><HorizonTable overview={view} /><AssumptionText data={data} /></section>
    <section className="plan-section"><h2>手元資金の推移</h2><BalancePlot calc={calc} stress={view.stress} />
      <p className="plan-note">年齢は各年の終了時点。1年目から60年目末までを計算し、30年目末などの修繕・買い替えも含みます。年末残高がプラスでも、年内の大きな支払いに備えた別途の資金繰り確認が必要です。</p>
    </section>
    <section className="plan-section"><h2>今の暮らしを続けるための月額予算</h2><MonthlyBudget overview={view} />
      <p className="plan-note">初年度の給与・賞与・年金・売電を12で割った月平均です。賞与を受け取らない月の収支とは異なります。退職金・控除・保険満期は除外。修繕・旅行・車等の積立は{data.simYears}年間の予定総額÷{data.simYears}年÷12の目安です。残高の計算では積立を再度差し引かず、実際の発生年に支出します。繰上返済は年次表で別途確認してください。</p>
    </section>
    <section className="plan-section"><h2>最後に残るお金の計算</h2><MoneyBridge calc={calc} years={data.simYears} />
      <div className="split-ledger">{[incomeItems, expenseItems].map((items, i) => <div key={i}><h3>{i === 0 ? '収入の内訳' : '支出の内訳'}</h3><table className="plan-table"><tbody>{items.map(([label, value]) => <tr key={label}><th>{label}</th><td>{fmt(value)}万円</td></tr>)}</tbody></table></div>)}</div>
      <p className="plan-note">太陽光の節電額は光熱費を減らし、売電だけを収入にしています。内部の計算は丸めず、画面表示のみ万円単位で四捨五入しているため、表示値の合計に端数差が出る場合があります。</p>
    </section>
    <section className="plan-section"><h2>条件が変わった場合の比較設定</h2><div className="form-grid">
      <Field label="設定金利の上乗せ"><NumInput value={data.stress.rateAdd} onChange={v => update({ stress: { ...data.stress, rateAdd: v } })} step={0.1} max={10} suffix="ポイント" /></Field>
      <Field label="給与・賞与の減少"><NumInput value={data.stress.incomeDropPct} onChange={v => update({ stress: { ...data.stress, incomeDropPct: v } })} step={1} max={100} suffix="%" /></Field>
      <Field label="将来支出の増加"><NumInput value={data.stress.expenseAddPct} onChange={v => update({ stress: { ...data.stress, expenseAddPct: v } })} step={1} max={100} suffix="%" /></Field>
    </div><AssumptionText data={data} /></section>
    <section className="plan-section">
      <div className="section-heading"><h2>お客様と確認する前提</h2><span className="review-badge">{view.allConfirmed ? '前提確認済み・将来を保証するものではありません' : '未確認の前提があります'}</span></div>
      <div className="review-checks">{Object.entries(REVIEW_LABELS).map(([key, label]) => <label key={key}><input type="checkbox" checked={data.reviewChecks[key as keyof typeof REVIEW_LABELS]} onChange={e => update({ reviewChecks: { ...data.reviewChecks, [key]: e.target.checked } })} />{label}</label>)}</div>
      <ul className="assumptions-list">{calc.warnings.map(w => <li key={w}>{w}</li>)}</ul>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>年ごとの収支・手元資金</h2><button className="action-button" onClick={() => downloadText('FP年次収支_' + data.basic.date + '.csv', csvFor(calc), 'text/csv;charset=utf-8')}><Download size={16} />60年分の明細</button></div>
      <p className="plan-note">単位：万円。収入には退職金・控除・保険受取を含みます。生活費には他ローン・保険料、住宅ローンには繰上返済を含みます。</p>
      <AnnualTable rows={periodRows} detailed />
    </section>
  </div>;
}
