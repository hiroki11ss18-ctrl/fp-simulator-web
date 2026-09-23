import { Field, NumInput, Select, Toggle } from '../ui';
import type { SimData, CalcResult, LoanPlan as Loan } from '../../types';
import { calcPropertyTax, lookupManualSalary } from '../../hooks/useCalculations';
import { fmt } from '../../lib/format';

export default function LoanPlan({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const l = data.loan, b = data.basic, h = data.housing, hh = data.household;
  const set = (patch: Partial<Loan>) => update({ loan: { ...l, ...patch } });
  const setHH = (patch: Partial<typeof hh>) => update({ household: { ...hh, ...patch } });
  const rateKeys = l.loanType === 'fix' ? ['fixRate1', 'fixRate2', 'fixRate3'] as const : ['varRate1', 'varRate2', 'varRate3'] as const;
  const periodKeys = l.loanType === 'fix' ? ['fixPeriod1', 'fixPeriod2'] as const : ['varPeriod1', 'varPeriod2'] as const;
  const p1 = l[periodKeys[0]], p2 = l[periodKeys[1]];
  const annualIncome = (b.age < b.retireAge ? (b.salaryAuto ? b.income : lookupManualSalary(b.salaryManual, b.age)) + b.annualBonusInc : 0)
    + (b.spouseEnabled && b.spouseAge < b.spouseRetireAge ? (b.salSpouseAuto ? b.spouseIncome : lookupManualSalary(b.spouseSalaryManual, b.spouseAge)) + b.spouseAnnualBonusInc : 0);
  const first = calc.rows[0];
  const annualPayment = first.loanPay - first.prepaid + first.otherLoanPay;
  const pt = calcPropertyTax(h, l);
  const number = (key: keyof Loan, label: string, suffix: string, step = 0.1, min = 0, max?: number) =>
    <Field label={label}><NumInput value={l[key] as number} onChange={v => set({ [key]: v })} suffix={suffix} step={step} min={min} max={max} /></Field>;
  return <div className="plan-layout">
    <section className="plan-section">
      <h2>借入額と返済条件</h2>
      <div className="form-grid">
        <Field label="実際の借入額" hint="0は住宅資金計画・設備の支払い方法から自動計算">
          <NumInput value={h.actualLoan} onChange={v => update({ housing: { ...h, actualLoan: v } })} suffix="万円" step={10} />
        </Field>
        <Field label="返済期間"><NumInput value={l.years} onChange={v => set({ years: Math.round(v), varPeriod1: Math.min(l.varPeriod1, Math.round(v)), varPeriod2: Math.min(l.varPeriod2, Math.round(v)), fixPeriod1: Math.min(l.fixPeriod1, Math.round(v)), fixPeriod2: Math.min(l.fixPeriod2, Math.round(v)) })} suffix="年" step={1} min={1} max={60} /></Field>
        <Field label="採用する金利"><Select value={l.loanType} onChange={loanType => set({ loanType })} options={[{ value: 'var', label: '変動金利シナリオ' }, { value: 'fix', label: '固定金利シナリオ' }]} /></Field>
      </div>
      <div className="metric-grid mt-5">
        <div className="metric"><span>実借入額</span><strong>{fmt(calc.loan)}<small>万円</small></strong></div>
        <div className="metric"><span>通常月の返済（当初）</span><strong>{fmt(calc.monthly, 2)}<small>万円/月</small></strong></div>
        <div className="metric"><span>初年度返済比率・他ローン含む</span><strong>{annualIncome > 0 ? fmt(annualPayment / annualIncome * 100, 1) : '算出不可'}<small>{annualIncome > 0 ? '%' : ''}</small></strong></div>
        <div className="metric"><span>完済時の年齢</span><strong>{calc.completionAge}<small>歳</small></strong></div>
      </div>
      <p className="plan-note">返済比率は額面給与・賞与に対する年間返済額（ボーナス返済・他ローンを含む、繰上返済を除く）。借りられる上限と、無理なく暮らせる予算は別です。購入時の現金支出は{fmt(calc.cashRequired)}万円、購入直後の手元資金は{fmt(calc.initialCash)}万円です。</p>
    </section>
    <section className="plan-section">
      <h2>金利の推移</h2>
      <div className="table-scroll"><table className="plan-table"><thead><tr><th>期間</th><th>年利</th><th>終了時点</th><th>その期間の開始時の通常月返済</th></tr></thead>
        <tbody>{rateKeys.map((key, i) => <tr key={key}>
          <th>第{i + 1}期<br /><small>{i === 0 ? '1' : (i === 1 ? p1 : p2) + 1}〜{i === 0 ? p1 : i === 1 ? p2 : l.years}年目</small></th>
          <td><NumInput value={l[key]} onChange={v => set({ [key]: v })} step={0.01} max={100} suffix="%" /></td>
          <td>{i < 2 ? <NumInput value={l[periodKeys[i]]} onChange={v => {
            const n = Math.round(v);
            set(i === 0 ? { [periodKeys[0]]: n, [periodKeys[1]]: Math.max(n, p2) } : { [periodKeys[1]]: Math.max(p1, n) });
          }} suffix="年後" step={1} min={i === 1 ? p1 : 1} max={l.years} /> : '完済まで'}</td>
          <td>{fmt([calc.monthlyPhase1, calc.monthlyPhase2, calc.monthlyPhase3][i], 2)} 万円/月</td>
        </tr>)}</tbody>
      </table></div>
      <p className="plan-note">元利均等返済。設定した金利変更時に残高と残期間で返済額を再計算します。金融機関ごとの5年ルール・125%ルール・返済日・端数処理・手数料・団信上乗せは自動反映しません。全期間固定は全期間を第1期に設定してください。</p>
      <div className="form-grid mt-4">
        {number('bonusAmount', 'ボーナス返済・1回分', '万円', 1)}
        <Field label="ボーナス返済の回数"><Select value={l.bonusTimes} onChange={bonusTimes => set({ bonusTimes })} options={[0, 1, 2, 3].map(value => ({ value, label: '年' + value + '回' }))} /></Field>
      </div>
    </section>
    <section className="plan-section">
      <h2>繰上返済</h2>
      <div className="form-grid">
        {number('pyear', '1回目の時期', '年目末', 1, 1, l.years)}{number('pamount', '1回目の金額', '万円', 10)}
        {number('pyear2', '2回目の時期', '年目末', 1, 1, l.years)}{number('pamount2', '2回目の金額', '万円', 10)}
        <Field label="繰上返済の方法"><Select value={l.ptype} onChange={ptype => set({ ptype })} options={[{ value: '期間短縮', label: '期間短縮' }, { value: '返済額軽減', label: '返済額軽減' }]} /></Field>
      </div>
      <p className="plan-note">返済総額 {fmt(calc.actualTotalRepay, 1)}万円（うち利息 {fmt(calc.actualTotalInt, 1)}万円）。繰上返済もその年の現金支出に含みます。返済額軽減後の年次支払いは総合まとめの年次表に反映します。</p>
    </section>
    <section className="plan-section">
      <h2>住宅以外のローン</h2>
      <div className="form-grid">
        <Field label="他ローンの残高"><NumInput value={hh.otherLoanBalance} onChange={v => setHH({ otherLoanBalance: v })} suffix="万円" /></Field>
        <Field label="毎月の返済額"><NumInput value={hh.otherLoan} onChange={v => setHH({ otherLoan: v })} suffix="万円/月" step={0.1} /></Field>
        <Field label="他ローンの年利"><NumInput value={hh.otherLoanRate} onChange={v => setHH({ otherLoanRate: v })} suffix="%" step={0.1} max={100} /></Field>
        <Field label="残りの支払回数" hint="残高が不明なときのみ使用"><NumInput value={hh.otherLoanMonths} onChange={v => setHH({ otherLoanMonths: Math.round(v) })} suffix="か月" step={1} max={720} /></Field>
      </div>
      <p className="plan-note">残高があれば残高・金利・毎月の返済額で完済まで計算します。残高0の場合は残り月数を使用。いずれも未入力で返済額がある場合は不足を見落とさないよう60年間計上し、確認事項に表示します。</p>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>住宅ローン控除</h2><Toggle checked={l.taxInclude} onChange={taxInclude => set({ taxInclude })} label="確認した上限で資金計画に含める" /></div>
      <div className="form-grid">
        <Field label="住宅の性能区分"><Select value={l.taxHouseType} onChange={taxHouseType => set({ taxHouseType })} options={[{ value: 'long_term', label: '認定長期優良・低炭素住宅' }, { value: 'zeh', label: 'ZEH水準省エネ住宅' }, { value: 'general', label: '省エネ基準適合住宅' }]} /></Field>
        {number('taxMoveInYear', '入居年', '年', 1, 2026, 2030)}
        {number('taxLoanAmount', '控除対象の借入額（0は実借入）', '万円', 10)}
        {b.spouseEnabled && b.loanBorrowType === 'pair' && number('taxPairMainShare', '世帯主の借入割合', '%', 1, 0, 100)}
      </div>
      <div className="mt-4"><Toggle checked={l.taxSpecialHousehold} onChange={taxSpecialHousehold => set({ taxSpecialHousehold })} label="子育て・若者夫婦世帯の上乗せ対象（要件確認済み）" /></div>
      {l.taxInclude && <div className="form-grid mt-4">
        {number('taxAnnualCap', '世帯主が控除できる年間税額上限', '万円/年', 0.1)}
        {b.spouseEnabled && b.loanBorrowType === 'pair' && number('taxSpouseAnnualCap', '配偶者が控除できる年間税額上限', '万円/年', 0.1)}
      </div>}
      <p className="plan-note">資金計画への計上額 {fmt(calc.taxDeductionTotal, 1)}万円。各人の年末残高に対する制度上限と、入力した所得税・住民税から実際に控除できる額の小さい方を使用。収入低下時は上限を比例縮小し、給与収入0の年は0とする保守的な概算です。制度上の借入限度額は1人{fmt(calc.taxBorrowLimit)}万円・最長{calc.taxDeductionYears}年。すべての適用要件や税額を判定するものではありません。</p>
      <p className="plan-note"><a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm" target="_blank" rel="noreferrer">国税庁：住宅借入金等特別控除</a>（2026年4月1日現在の制度）。2028年以降の省エネ基準適合住宅の経過措置等は別途確認。本試算の対応外は0円です。未確認の控除を、毎月の返済原資に含めないでください。</p>
    </section>
    <section className="plan-section">
      <h2>固定資産税・都市計画税</h2>
      <div className="mb-4"><Toggle checked={h.cityPlanningTaxEnabled} onChange={cityPlanningTaxEnabled => update({ housing: { ...h, cityPlanningTaxEnabled } })} label="都市計画税の対象区域" /></div>
      <Toggle checked={l.isLongTermHouse} onChange={isLongTermHouse => set({ isLongTermHouse })} label="新築住宅の固定資産税軽減を5年間で計算（認定長期優良住宅）" />
      <div className="metric-grid mt-4"><div className="metric"><span>新築軽減中・年額</span><strong>{fmt(pt.during, 2)}<small>万円</small></strong></div><div className="metric"><span>軽減終了後・年額</span><strong>{fmt(pt.after, 2)}<small>万円</small></strong></div></div>
      <p className="plan-note">出雲市の固定資産税1.5%、都市計画税0.075%（区域設定による）。一般住宅3年・認定長期優良住宅5年、住宅部分120㎡までの建物固定資産税を半額とする概算。土地は住宅用地特例を面積按分。評価額は住宅資金計画で設定します。評価替え・経年減価は未反映です。</p>
    </section>
  </div>;
}
