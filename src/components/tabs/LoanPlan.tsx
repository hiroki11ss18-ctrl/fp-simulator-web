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
  const taxPair = b.spouseEnabled && b.loanBorrowType === 'pair';
  const taxIssue = l.taxMoveInYear !== Number(b.date.slice(0, 4)) ? '入居年と基本情報の試算開始年が異なるため、概算は保留しています。'
    : calc.taxDeductionYears === 0 ? 'この入居年・性能区分は試算の対応外です。2028年以降の省エネ基準適合住宅の経過措置等は個別確認が必要です。'
      : l.years < 10 ? '返済期間が10年未満のため、本試算では控除対象外です。' : '';
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
        <Field label="採用する金利"><Select value={l.loanType} onChange={loanType => set({ loanType })} options={[{ value: 'var', label: '変動金利' }, { value: 'fix', label: '固定金利' }]} /></Field>
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
      <div className="section-heading"><h2>住宅ローン控除の目安</h2><span>参考表示のみ・資金計画への加算なし</span></div>
      {taxIssue ? <p className="plan-note" role="status">{taxIssue}</p> : <div className="metric-grid mb-4">
        <div className="metric"><span>1年目の税負担軽減額（概算）</span><strong>約{fmt(calc.taxEstimateRows[0]?.total ?? 0, 1)}<small>万円</small></strong></div>
        <div className="metric"><span>{calc.taxDeductionYears}年間の合計（概算）</span><strong>約{fmt(calc.taxDeductionTotal, 1)}<small>万円</small></strong></div>
        {taxPair && <><div className="metric"><span>合計のうち世帯主分</span><strong>約{fmt(calc.taxDeductionMain, 1)}<small>万円</small></strong></div>
          <div className="metric"><span>合計のうち配偶者分</span><strong>約{fmt(calc.taxDeductionSpouse, 1)}<small>万円</small></strong></div></>}
      </div>}
      <p className="plan-note">所得税の還付・減額と翌年の住民税の軽減を合わせた目安です。全額が現金で戻るわけではありません。総合まとめ・提案書の収入や手元資金には含めません。</p>
      <div className="form-grid">
        <Field label="住宅の性能区分"><Select value={l.taxHouseType} onChange={taxHouseType => set({ taxHouseType })} options={[{ value: 'long_term', label: '認定長期優良・低炭素住宅' }, { value: 'zeh', label: 'ZEH水準省エネ住宅' }, { value: 'general', label: '省エネ基準適合住宅' }]} /></Field>
        {number('taxMoveInYear', '入居年', '年', 1, 2026, 2030)}
        {number('taxLoanAmount', '控除対象の借入額（0は実借入）', '万円', 10)}
        {taxPair && number('taxPairMainShare', '世帯主の借入割合', '%', 1, 0, 100)}
      </div>
      <div className="mt-4"><Toggle checked={l.taxSpecialHousehold} onChange={taxSpecialHousehold => set({ taxSpecialHousehold })} label="子育て・若者夫婦世帯の上乗せ対象（要件確認済み）" /></div>
      <div className="form-grid mt-4">
        <Field label="税額の見積方法"><Select value={l.taxEstimateMode} onChange={taxEstimateMode => set({ taxEstimateMode })} options={[{ value: 'income', label: '給与年収から概算' }, { value: 'manual', label: '確認済みの年間上限を入力' }]} /></Field>
        {l.taxEstimateMode === 'income' ? <>
          {number('taxSocialInsurancePct', '社会保険料の仮定（給与年収に対する割合）', '%', 0.5, 0, 100)}
          {number('taxOtherDeductionMain', '世帯主の追加所得控除（扶養・保険等）', '万円/年', 1)}
          {taxPair && number('taxOtherDeductionSpouse', '配偶者の追加所得控除（扶養・保険等）', '万円/年', 1)}
        </> : <>
          {number('taxAnnualCap', '世帯主の控除可能額（所得税＋住民税）', '万円/年', 0.1)}
          {taxPair && number('taxSpouseAnnualCap', '配偶者の控除可能額（所得税＋住民税）', '万円/年', 0.1)}
        </>}
      </div>
      <p className="plan-note">{l.taxEstimateMode === 'income'
        ? '給与・賞与の推移、昇給・退職・配偶者の休業を反映。給与所得控除・基礎控除と上記の社会保険料・追加所得控除から税額を概算します。扶養・配偶者・生命保険・iDeCo等の控除は自動判定しません。追加所得控除が0なら未反映です。年金・事業所得・退職所得、他の税額控除、住民税の個別調整、付加税、年末調整表の細かな端数は未反映です。'
        : '入力額は毎年同額で見込みます。退職・休業などによる税額変化は自動反映しません。住民税の控除上限を含め、実際に住宅ローン控除を使える額を税務署・税理士等で確認した場合の概算です。0は控除なしとして扱います。'}</p>
      {!taxIssue && <details className="mt-4"><summary>年ごとの控除目安</summary>
        <div className="table-scroll"><table className="plan-table"><thead><tr><th>入居から</th><th>借入残高等による上限</th><th>世帯主の目安</th>{taxPair && <th>配偶者の目安</th>}<th>合計の目安</th></tr></thead>
          <tbody>{calc.taxEstimateRows.map(row => <tr key={row.year}><th>{row.year}年目</th><td>{fmt(row.loanLimit, 2)}万円</td><td>{fmt(row.main, 2)}万円</td>{taxPair && <td>{fmt(row.spouse, 2)}万円</td>}<td>{fmt(row.total, 2)}万円</td></tr>)}</tbody>
        </table></div>
      </details>}
      <p className="plan-note">新築住宅・各年12回返済後の残高で概算。1人あたりの借入限度額は{fmt(calc.taxBorrowLimit)}万円、控除率0.7%。借入割合は持分と一致する仮定です。補助金等を差し引いた取得対価・借入使途・床面積・所得・居住等の適用要件は別途確認が必要です。制度改正や初年度の返済月数によって実額は変わります。</p>
      <p className="plan-note">制度確認：<a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm" target="_blank" rel="noreferrer">国税庁・住宅ローン控除</a> / <a href="https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf" target="_blank" rel="noreferrer">2026年改正の所得控除</a> / <a href="https://www.city.kyoto.lg.jp/gyozai/page/0000027932.html" target="_blank" rel="noreferrer">住民税の控除上限</a>（2026年10月2日確認）。2028年以降の税額は確認時点の制度が続く仮定です。</p>
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
