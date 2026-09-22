import { forwardRef, useMemo } from 'react';
import type { SimData, CalcResult } from '../types';
import { fmt } from '../lib/format';
import { buildOverview, REVIEW_LABELS } from '../lib/planning';
import { PROPOSAL_STYLES } from '../lib/proposalStyles';
import { ENERGY_SOURCE } from '../lib/energy';
import { EDUCATION_SOURCE, childrenOf } from '../lib/education';
import { lookupManualSalary } from '../hooks/useCalculations';
import { HorizonTable, MoneyBridge, MonthlyBudget, BalancePlot, AnnualTable, AssumptionText } from './PlanResults';

const PrintProposal = forwardRef<HTMLDivElement, { data: SimData; calc: CalcResult }>(({ data, calc }, ref) => {
  const view = useMemo(() => buildOverview(data, calc), [data, calc]);
  const b = data.basic, l = data.loan, s = data.solar;
  const rates = l.loanType === 'fix' ? [l.fixRate1, l.fixRate2, l.fixRate3] : [l.varRate1, l.varRate2, l.varRate3];
  const periods = l.loanType === 'fix' ? [l.fixPeriod1, l.fixPeriod2] : [l.varPeriod1, l.varPeriod2];
  const chunks = [0, 20, 40].map(start => calc.rows.slice(start, start + 20));
  const conditionRows = [
    ['試算開始日・期間', b.date + ' / 最大60年間'],
    ['現在の年齢', '世帯主 ' + b.age + '歳' + (b.spouseEnabled ? ' / 配偶者 ' + b.spouseAge + '歳' : '')],
    ['年収＋賞与（額面）', '世帯主 ' + (b.age >= b.retireAge ? '退職済み' : fmt(b.salaryAuto ? b.income : lookupManualSalary(b.salaryManual, b.age)) + '＋' + fmt(b.annualBonusInc) + '万円') + ' / 配偶者 ' + (!b.spouseEnabled ? '対象外' : b.spouseAge >= b.spouseRetireAge ? '退職済み' : fmt(b.salSpouseAuto ? b.spouseIncome : lookupManualSalary(b.spouseSalaryManual, b.spouseAge)) + '＋' + fmt(b.spouseAnnualBonusInc) + '万円')],
    ['給与手取り率', '世帯主 ' + b.takeHomePct + '% / 配偶者 ' + b.spouseTakeHomePct + '%'],
    ['昇給設定', '世帯主 ' + (b.salaryAuto ? '自動 ' + b.incomeGrowth + '%' : '手動カーブ') + ' / 配偶者 ' + (b.salSpouseAuto ? '自動 ' + b.spouseGrowth + '%' : '手動カーブ')],
    ['定年・手取り退職金', '世帯主 ' + b.retireAge + '歳 ' + fmt(b.retireBonus) + '万円 / 配偶者 ' + (b.spouseEnabled ? b.spouseRetireAge + '歳 ' + fmt(b.spouseRetireBonus) + '万円' : '対象外')],
    ['月の手取り年金・開始年齢', fmt(calc.pensionM, 1) + '万円＋' + fmt(calc.spPensionM, 1) + '万円 / 各人' + b.pensionStartAge + '歳から'],
    ['購入総額・実借入', fmt(calc.totalCost) + '万円 / ' + fmt(calc.loan) + '万円・' + l.years + '年'],
    ['採用金利（第1・2・3期）', rates.map(r => fmt(r, 2) + '%').join(' / ') + '（' + periods[0] + '年、' + periods[1] + '年で変更）'],
    ['審査用設定（返済額とは別）', '審査金利 ' + data.housing.reviewRate + '% / 比率 ' + data.housing.repRatio + '%'],
    ['賞与返済・繰上返済', fmt(l.bonusAmount) + '万円×年' + l.bonusTimes + '回 / ' + l.pyear + '年目' + fmt(l.pamount) + '万円・' + l.pyear2 + '年目' + fmt(l.pamount2) + '万円（' + l.ptype + '）'],
    ['他ローン', '残高 ' + fmt(data.household.otherLoanBalance) + '万円 / 月' + fmt(data.household.otherLoan, 1) + '万円 / 年利' + data.household.otherLoanRate + '% / 残高不明時' + data.household.otherLoanMonths + 'か月'],
    ['住宅ローン控除', l.taxInclude ? '確認上限で計上 / 主 ' + l.taxAnnualCap + '万円・配偶者 ' + l.taxSpouseAnnualCap + '万円/年' : '資金計画に含めない'],
    ['物価上昇率', data.household.inflationRate + '%/年（対象費用に複利適用）'],
    ['太陽光・蓄電池', s.enabled ? s.solarKw + 'kW / 蓄電池 ' + (s.battEnabled ? s.battCapacity + 'kWh' : 'なし') : 'なし'],
    ['設備費の扱い', ({ included: '建物等の見積に含む', cash: '別途現金', loan: '別途住宅ローン' })[s.funding] + ' / ' + fmt(calc.solarInitial) + '万円'],
    ['電気・売電', s.monthlyUsage + 'kWh/月 / 昼' + s.elecPriceDay + '円・夜' + s.elecPriceNight + '円 / 売電' + Math.min(s.fitStepYears, s.fitYears) + '年まで' + s.fitRate + '円、' + (s.fitStepYears < s.fitYears ? s.fitYears + '年まで' + s.fitRateMiddle + '円、' : '') + 'FIT後' + s.fitRateAfter + '円'],
    ['設備更新の仮定', '発電低下' + s.degradationPct + '%/年、パネル' + s.panelLifeYears + '年で' + (s.panelReplace ? fmt(s.panelReplaceCost) + '万円更新' : '利用終了')],
  ];
  return <div ref={ref} className="fp-proposal">
    <style dangerouslySetInnerHTML={{ __html: PROPOSAL_STYLES }} />
    <section className="proposal-page">
      <header className="proposal-header"><div><p className="proposal-subtitle">住まいと暮らしの資金計画</p><h1>ライフプラン提案書</h1><p>{b.customerName || 'お客様名未入力'} 様 / 担当 {b.staffName || '未入力'} / {b.date}</p></div><div className="proposal-status">{view.allConfirmed ? '前提確認済み' : '前提未確認・試算'}</div></header>
      <p><strong>{view.horizonRows[3].low.balance < 0 ? '60年間の途中で資金不足の見込みです。最初の不足は' + (view.horizonRows[3].deficit === 0 ? '購入時点' : view.horizonRows[3].deficit + '年後') + '。資金計画の見直しが必要です。' : '入力条件に基づく試算です。将来の収支を保証するものではありません。'}</strong></p>
      <div className="metric-grid">
        <div className="metric"><span>購入直後の手元資金</span><strong className={calc.initialCash < 0 ? 'negative' : ''}>{fmt(calc.initialCash)}<small>万円</small></strong></div>
        <div className="metric"><span>支払い・積立後の月平均余力</span><strong className={view.monthlySurplus < 0 ? 'negative' : ''}>{fmt(view.monthlySurplus, 2)}<small>万円</small></strong></div>
        <div className="metric"><span>{data.simYears}年後の手元資金</span><strong className={view.selected.balance < 0 ? 'negative' : ''}>{fmt(view.selected.balance)}<small>万円</small></strong></div>
      </div>
      <h2>30・40・50・60年後の見通し</h2><HorizonTable overview={view} />
      <AssumptionText data={data} />
      <h2>手元資金の推移</h2><BalancePlot calc={calc} stress={view.stress} />
      <MoneyBridge calc={calc} years={data.simYears} />
      <p className="plan-note">預貯金として残るお金の試算です。不動産売却価値や未受取の保険積立は含みません。残る借入は別表示。マイナスは資金不足で、追加融資は自動計上しません。年末時点の計算のため、年内の大きな支払いへの備えは別途必要です。</p>
      <footer className="proposal-footer">金額は万円・表示のみ四捨五入。FPシミュレーター 計算仕様2026.09 / この提案書の条件と確認事項をセットでご確認ください。</footer>
    </section>
    <section className="proposal-page">
      <header className="proposal-header"><h2>毎月の予算と、採用した前提</h2><span>{b.customerName || 'お客様'} 様</span></header>
      <MonthlyBudget overview={view} />
      <p className="plan-note">初年度の年収・賞与等を12で割った平均で、賞与のない月の収支とは異なります。退職金・控除・満期受取を除外。修繕・旅行・車の積立は{data.simYears}年間の予定総額÷{data.simYears}年÷12。年次残高では積立を重ねて差し引かず、発生年に実際の支出を計上します。繰上返済は年次表で別途確認。生活防衛資金は{b.emergencyFundMonths}か月分・約{fmt(view.emergencyFund)}万円の仮目標です。</p>
      <h2>お子さまの進路</h2>{childrenOf(b).map((k, i) => <p key={i}>第{i + 1}子 {k.age}歳 / 公立小学校・{k.mid}・{k.high}・{k.uni} / 下宿{k.alone}年・仕送り月{b.aloneMonthly}万円</p>)}
      {b.kids === 0 && <p>お子さまの教育費は計上していません。</p>}
      <footer className="proposal-footer">現役期・退職後の費用、旅行・車の買い替え、教育費が実際の希望と合っているかをご確認ください。</footer>
    </section>
    <section className="proposal-page">
      <header className="proposal-header"><h2>試算に採用した前提</h2><span>{b.customerName || 'お客様'} 様</span></header>
      <h2>試算条件</h2><dl className="condition-list">{conditionRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <footer className="proposal-footer">年金・退職金は手取りで計上。給与は額面から入力した手取り率で概算します。税金・社会保険料の厳密な個別計算は行いません。</footer>
    </section>
    <section className="proposal-page">
      <header className="proposal-header"><h2>予定支出と確認事項</h2><span>{b.date}</span></header>
      <h3>旅行・車・一時支出</h3>
      {data.suddenExpenses.length ? <table className="plan-table"><thead><tr><th>予定</th><th>現在価格・1回</th><th>時期・間隔</th></tr></thead><tbody>{data.suddenExpenses.map(e => <tr key={e.id}><th>{e.name || '名称未入力'}</th><td>{fmt(e.amount)}万円</td><td>{e.firstYear ?? e.cycleYears}年目から{e.once ? '1回のみ' : e.cycleYears + '年ごと・' + (e.endYear ?? 60) + '年目まで'}</td></tr>)}</tbody></table> : <p>未設定</p>}
      <h3>貯蓄型保険</h3>
      {data.savingsInsurances.map(si => <p key={si.id}>{si.name || '名称未入力'} / 月{fmt(si.monthly, 2)}万円を{si.payoutYear}年目まで払い、年末に{fmt(si.payoutAmount)}万円受取。</p>)}
      {!data.savingsInsurances.length && <p>設定なし</p>}
      <h3>前提の確認状況</h3>
      {Object.entries(REVIEW_LABELS).map(([key, label]) => <p key={key}>{data.reviewChecks[key as keyof typeof REVIEW_LABELS] ? '確認済み' : '未確認'}：{label}</p>)}
      <h3>この試算で注意する点</h3><ul className="assumptions-list">{calc.warnings.map(w => <li key={w}>{w}</li>)}</ul>
      <h3>参考資料</h3>
      <p className="plan-note"><a href={ENERGY_SOURCE}>環境省 令和5年度家庭CO2統計 図1-62</a> / <a href="https://www.jpea.gr.jp/faq/563/">JPEA 発電量の目安</a> / <a href={EDUCATION_SOURCE}>文部科学省 令和5年度学習費調査・訂正後</a> / <a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm">国税庁 住宅ローン控除</a> / <a href="https://www.city.izumo.shimane.jp/www/contents/1595294633348/index.html">出雲市 固定資産税</a>。参照確認：2026年9月。</p>
      <footer className="proposal-footer">この試算は意思決定を補助するもので、融資審査・税務判断・将来収入の確約ではありません。金利・家族構成・進路・料金・制度が変わったときは更新してください。</footer>
    </section>
    {chunks.map((rows, i) => <section className="proposal-page" key={i}>
      <header className="proposal-header"><h2>年次収支 / {rows[0].year}〜{rows[rows.length - 1].year}年後</h2><span>単位：万円</span></header>
      <AnnualTable rows={rows} />
      <p className="plan-note">収入＝給与・年金・退職金・控除・保険満期受取・売電。住宅ローンには繰上返済を含みます。その他支出＝生活費・他ローン・保険料・節電後の光熱費・教育費・税・修繕・予定支出。年齢は各年終了時点。</p>
      <footer className="proposal-footer">{b.customerName || 'お客様'} 様 / {b.date} / 入力条件に基づく年末残高の試算</footer>
    </section>)}
  </div>;
});
PrintProposal.displayName = 'PrintProposal';
export default PrintProposal;
