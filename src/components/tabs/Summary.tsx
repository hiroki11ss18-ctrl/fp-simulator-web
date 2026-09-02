import type { SimData, CalcResult, YearRow } from '../../types';
import { Card } from '../ui';
import { fmtMan } from '../../lib/format';
import { countSuddenExpenseOccurrences } from '../../lib/suddenExpenses';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

export default function Summary({ data, calc }: { data: SimData; calc: CalcResult }) {
  const rows = calc.rows.slice(0, data.simYears);
  const b = data.basic;

  const endBal = rows[rows.length - 1]?.balance ?? 0;
  const endAge = rows[rows.length - 1]?.age ?? 0;
  const startBalance = b.savings + (b.spouseSavings ?? 0);

  // ─── 生涯総収入・総支出 ───
  const totalIncome = calc.lifeIncWage + calc.lifeIncPension + calc.lifeIncRetBonus
                    + calc.lifeIncTaxBack + calc.lifeIncSolar + calc.lifeIncSiPayout;
  const totalExpense = calc.lifeExpLoanPay + calc.lifeExpPropTax + calc.lifeExpLiving
                     + calc.lifeExpUtility + calc.lifeExpEdu + calc.lifeExpMaint
                     + calc.lifeExpSudden + calc.lifeExpSiPaid;
  const lifetimeNet = totalIncome - totalExpense;

  // ─── 最低残高・要注意期 ───
  const minBalRow = rows.length ? rows.reduce((a, b2) => a.balance < b2.balance ? a : b2) : null;
  const negAgeRow = rows.find(r => r.balance < 0);

  // ─── 月平均余剰 ───
  const workRows = rows.filter(r => r.age < b.retireAge);
  const retRows = rows.filter(r => r.age >= b.retireAge);
  const workMonthAvg = workRows.length ? workRows.reduce((a, r) => a + r.net, 0) / workRows.length / 12 : 0;
  const retMonthAvg = retRows.length ? retRows.reduce((a, r) => a + r.net, 0) / retRows.length / 12 : 0;

  // ─── 商談で確認しやすい短い論点 ───
  const householdAnnual = b.income + b.annualBonusInc + (b.spouseEnabled ? b.spouseIncome + b.spouseAnnualBonusInc : 0);
  const repaymentRatio = householdAnnual > 0 ? ((calc.monthly + data.household.otherLoan) * 12 / householdAnnual) * 100 : 0;
  const loanAfterRetire = calc.completionAge > b.retireAge;
  const meetingChecks = [
    {
      label: '返済比率',
      value: `${repaymentRatio.toFixed(1)}%`,
      tone: repaymentRatio <= 25 ? 'good' : repaymentRatio <= 30 ? 'warn' : 'danger',
      text: repaymentRatio <= 25
        ? '月々返済は説明しやすい水準です。教育費・車費用を入れても余裕が残るか確認します。'
        : repaymentRatio <= 30
          ? '少し高めです。月支出や他ローンを確認して、借入額・頭金の調整余地を見ます。'
          : '高めです。商談では借入額・返済期間・頭金の見直しを優先して話すのが安全です。',
    },
    {
      label: '完済時期',
      value: `${calc.completionAge}歳`,
      tone: loanAfterRetire ? 'warn' : 'good',
      text: loanAfterRetire
        ? `定年${b.retireAge}歳後も返済が残ります。退職金・繰上返済・返済期間を確認したいポイントです。`
        : '定年前完済の見込みです。老後生活費に住宅ローンが残りにくい点を説明できます。',
    },
    {
      label: '最低残高',
      value: `${fmtMan(minBalRow?.balance ?? 0)}万円`,
      tone: (minBalRow?.balance ?? 0) < 0 ? 'danger' : (minBalRow?.balance ?? 0) < 500 ? 'warn' : 'good',
      text: (minBalRow?.balance ?? 0) < 0
        ? `${minBalRow?.age ?? '-'}歳ごろに資金ショートします。教育費・生活費・借入条件の再確認が必要です。`
        : (minBalRow?.balance ?? 0) < 500
          ? `${minBalRow?.age ?? '-'}歳ごろの手元資金が薄めです。車買い替えや家電など急な出費を入れて確認します。`
          : '期間中の手元資金は大きく崩れにくい見込みです。未入力の大きな支出だけ確認します。',
    },
  ] as const;

  // ─── 教育費ピーク ───
  const eduRows = rows.filter(r => r.eduCost >= 100);
  const peakEduRow = eduRows.length ? eduRows.reduce((a, b2) => a.eduCost > b2.eduCost ? a : b2) : null;

  // ─── 太陽光投資回収（簡易・累積収益が初期投資を超える年） ───
  let solarPaybackYear = -1;
  if (data.solar.enabled && data.solar.solarKw > 0) {
    const initCost = data.solar.solarCost + (data.solar.battEnabled ? data.solar.battCost : 0);
    let cumSolar = -initCost;
    for (const r of rows) {
      cumSolar += r.solarBenefit;
      if (cumSolar >= 0) { solarPaybackYear = r.year + 1; break; }
    }
  }

  // ─── ライフステージ別アドバイス ───
  const advice = generateAdvice(rows, data, calc, peakEduRow);

  // 資産推移グラフ
  const chartData = rows.map(r => ({
    age: r.age,
    残高: Math.round(r.balance),
    年収入: Math.round(r.income + r.solarBenefit),
    年支出: Math.round(r.loanPay + r.living + r.utility + r.propTax + r.eduCost + r.maintCost),
  }));

  return (
    <div className="space-y-4">
      {/* ━━━━━━━━━ ヘッダー（提案書タイトル） ━━━━━━━━━ */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-3 border-b border-line-card pb-3 mb-3">
          <div>
            <div className="text-[11px] text-ink-sub uppercase tracking-widest">FP Life Plan Proposal</div>
            <h1 className="text-xl font-bold text-ink-main mt-1">ライフプランシミュレーション提案書</h1>
          </div>
          <div className="text-xs text-ink-sub text-right space-y-0.5">
            <div>顧客名: <span className="text-ink-main font-bold text-sm">{b.customerName || '—'} 様</span></div>
            <div>担当: {b.staffName || '—'}</div>
            <div>作成日: {b.date}</div>
          </div>
        </div>

        {/* ━━━ ハイライト: ○年後の残高 ━━━ */}
        <div className="bg-gradient-to-br from-accent-blue/15 to-accent-blue/5 border-2 border-accent-blue/30 rounded-[14px] p-6 text-center">
          <div className="text-xs text-ink-sub uppercase tracking-widest">{data.simYears}年後の予想資産残高</div>
          <div className="text-5xl font-bold tabular text-accent-blue mt-2 leading-none">
            {fmtMan(endBal)}<span className="text-xl font-normal text-ink-sub ml-1">万円</span>
          </div>
          <div className="text-xs text-ink-sub mt-2">
            {endAge}歳時点 / 当初貯蓄 {fmtMan(startBalance)}万 → <span className={`font-bold ${endBal - startBalance >= 0 ? 'text-status-ok' : 'text-status-danger'}`}>{(endBal - startBalance >= 0 ? '+' : '')}{fmtMan(endBal - startBalance)}万</span>
          </div>
        </div>
      </Card>

      {/* ━━━━━━━━━ 収支対比 ━━━━━━━━━ */}
      <Card title="📊 生涯収支サマリー">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigStat tone="good" label="💰 生涯総収入" value={fmtMan(totalIncome)} note={`${data.simYears}年間の合計`} />
          <BigStat tone="bad" label="💸 生涯総支出" value={fmtMan(totalExpense)} note={`${data.simYears}年間の合計`} />
          <BigStat
            tone={lifetimeNet >= 0 ? 'good' : 'bad'}
            label={lifetimeNet >= 0 ? '✅ 生涯黒字' : '⚠ 生涯赤字'}
            value={`${lifetimeNet >= 0 ? '+' : ''}${fmtMan(lifetimeNet)}`}
            note="収入 − 支出"
          />
        </div>
      </Card>

      {/* ━━━━━━━━━ KPI ━━━━━━━━━ */}
      <Card title="🎯 重要指標">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="現役期 月平均余剰" value={fmtMan(workMonthAvg)} unit="万円/月" tone={workMonthAvg >= 0 ? 'good' : 'bad'} />
          <KPI label="退職後 月平均余剰" value={fmtMan(retMonthAvg)} unit="万円/月" tone={retMonthAvg >= 0 ? 'good' : 'bad'} />
          <KPI label="ローン完済年齢" value={`${calc.completionAge}`} unit="歳" tone="normal" />
          <KPI label="最低残高 (発生年齢)" value={fmtMan(minBalRow?.balance ?? 0)} unit={`万円 / ${minBalRow?.age ?? 0}歳`} tone={(minBalRow?.balance ?? 0) < 0 ? 'bad' : 'normal'} />
        </div>
        {negAgeRow && (
          <div className="mt-3 bg-status-danger/8 border border-status-danger/30 rounded-[8px] p-3 text-sm">
            ⚠ <strong className="text-status-danger">{negAgeRow.age}歳</strong>時点で資産がマイナス（{fmtMan(negAgeRow.balance)}万円）になる見込みです。事前の貯蓄計画見直しを推奨します。
          </div>
        )}
      </Card>

      <Card title="商談で確認するポイント">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {meetingChecks.map(item => (
            <MeetingCheck key={item.label} {...item} />
          ))}
        </div>
      </Card>

      {/* ━━━━━━━━━ 収入・支出の内訳 ━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 収入内訳 */}
        <Card title="💰 収入の内訳（生涯）" accent="green">
          <div className="space-y-1.5 text-sm">
            <DetailRow label="給与収入（現役期 手取り）" value={calc.lifeIncWage} />
            {calc.lifeLeaveIncomeLoss > 0 && (
              <LossDetailRow label="産休・育休による収入減" value={calc.lifeLeaveIncomeLoss} />
            )}
            <DetailRow label="年金収入（退職後 手取り）" value={calc.lifeIncPension} />
            <DetailRow label="退職金" value={calc.lifeIncRetBonus} />
            <DetailRow label="住宅ローン控除" value={calc.lifeIncTaxBack} />
            {data.solar.enabled && (
              <DetailRow label="太陽光効果（節電＋売電）" value={calc.lifeIncSolar} highlight />
            )}
            {calc.lifeIncSiPayout > 0 && (
              <DetailRow label="貯蓄型保険 満期受取" value={calc.lifeIncSiPayout} highlight />
            )}
            <div className="border-t-2 border-status-ok/30 pt-2 mt-2 flex justify-between font-bold">
              <span className="text-status-ok">合計</span>
              <span className="tabular text-status-ok text-lg">{fmtMan(totalIncome)} <span className="text-xs font-normal">万円</span></span>
            </div>
          </div>
        </Card>

        {/* 支出内訳 */}
        <Card title="💸 支出の内訳（生涯）" accent="red">
          <div className="space-y-1.5 text-sm">
            <DetailRow label="住宅ローン返済" value={calc.lifeExpLoanPay} />
            <DetailRow label="固定資産税" value={calc.lifeExpPropTax} />
            <DetailRow label="生活費" value={calc.lifeExpLiving} />
            <DetailRow label="光熱費（電気・ガス・水道）" value={calc.lifeExpUtility} />
            <DetailRow label="教育費" value={calc.lifeExpEdu} />
            <DetailRow label="メンテナンス費" value={calc.lifeExpMaint} />
            {calc.lifeExpSudden > 0 && <DetailRow label="急な出費" value={calc.lifeExpSudden} />}
            {calc.lifeExpSiPaid > 0 && <DetailRow label="貯蓄型保険 払込" value={calc.lifeExpSiPaid} />}
            <div className="border-t-2 border-status-danger/30 pt-2 mt-2 flex justify-between font-bold">
              <span className="text-status-danger">合計</span>
              <span className="tabular text-status-danger text-lg">{fmtMan(totalExpense)} <span className="text-xs font-normal">万円</span></span>
            </div>
          </div>
        </Card>
      </div>

      {/* ━━━━━━━━━ 住宅プラン ━━━━━━━━━ */}
      <Card title="🏠 住宅プラン詳細">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Mini label="総費用" value={`${fmtMan(calc.totalCost)} 万`} />
          <Mini label="頭金（自己資金）" value={`${fmtMan(data.housing.down)} 万`} />
          <Mini label="借入額" value={`${fmtMan(calc.loan)} 万`} accent />
          <Mini label="返済期間" value={`${data.loan.years} 年`} />
          <Mini label="完済年齢" value={`${calc.completionAge} 歳`} accent />
          <Mini label="月返済（1期）" value={`${fmtMan(calc.monthly)} 万/月`} />
          <Mini label="総返済額" value={`${fmtMan(calc.actualTotalRepay)} 万`} />
          <Mini label="うち利息" value={`${fmtMan(calc.actualTotalInt)} 万`} />
        </div>
      </Card>

      {/* ━━━━━━━━━ 太陽光（導入時のみ） ━━━━━━━━━ */}
      {data.solar.enabled && data.solar.solarKw > 0 && (
        <Card title="☀️ 太陽光・蓄電池サマリー" accent="orange">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Mini label="パネル容量" value={`${data.solar.solarKw} kW`} />
            <Mini label="システム費用" value={`${fmtMan(data.solar.solarCost)} 万`} />
            {data.solar.battEnabled && <Mini label="蓄電池費用" value={`${fmtMan(data.solar.battCost)} 万`} />}
            <Mini label="年間発電量" value={`${calc.annualKwh.toLocaleString()} kWh`} />
            <Mini label="FIT中 年効果" value={`${fmtMan(calc.solarAnnualFit)} 万/年`} />
            <Mini label="FIT後 年効果" value={`${fmtMan(calc.solarAnnualPost)} 万/年`} />
            <Mini label={`生涯累計効果（${data.simYears}年）`} value={`${fmtMan(calc.lifeIncSolar)} 万`} accent />
            <Mini label="投資回収" value={solarPaybackYear > 0 ? `${solarPaybackYear} 年目` : '期間内では未回収'} accent />
          </div>
        </Card>
      )}

      {/* ━━━━━━━━━ 教育費の内訳 ━━━━━━━━━ */}
      {b.kids > 0 && (
        <Card title={`🎓 教育費の内訳（${b.kids}人）`}>
          <KidsEduTable data={data} />
        </Card>
      )}

      {/* ━━━━━━━━━ 貯蓄型保険（あれば） ━━━━━━━━━ */}
      {data.savingsInsurances.length > 0 && (
        <Card title="💎 貯蓄型保険" accent="blue">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-ink-label border-b border-line-table text-xs">
                  <th className="py-2 text-left pr-3">名称</th>
                  <th className="py-2 text-right pr-3">月額</th>
                  <th className="py-2 text-right pr-3">満期</th>
                  <th className="py-2 text-right pr-3">累計払込</th>
                  <th className="py-2 text-right pr-3">満期受取</th>
                  <th className="py-2 text-right">損益</th>
                </tr>
              </thead>
              <tbody>
                {data.savingsInsurances.map(si => {
                  const paid = si.monthly * 12 * si.payoutYear;
                  const diff = si.payoutAmount - paid;
                  return (
                    <tr key={si.id} className="border-b border-line-table">
                      <td className="py-2 pr-3 text-ink-main">{si.name || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular">{si.monthly} 万/月</td>
                      <td className="py-2 pr-3 text-right tabular">{si.payoutYear}年後</td>
                      <td className="py-2 pr-3 text-right tabular">{fmtMan(paid)} 万</td>
                      <td className="py-2 pr-3 text-right tabular text-status-ok">{fmtMan(si.payoutAmount)} 万</td>
                      <td className={`py-2 text-right tabular font-bold ${diff >= 0 ? 'text-status-ok' : 'text-status-danger'}`}>
                        {diff >= 0 ? '+' : ''}{fmtMan(diff)} 万
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ━━━━━━━━━ 急な出費（あれば） ━━━━━━━━━ */}
      {data.suddenExpenses.length > 0 && (
        <Card title="💸 急な出費" accent="red">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-ink-label border-b border-line-table text-xs">
                  <th className="py-2 text-left pr-3">項目</th>
                  <th className="py-2 text-right pr-3">発生周期</th>
                  <th className="py-2 text-right pr-3">1回の金額</th>
                  <th className="py-2 text-right pr-3">{data.simYears}年内 回数</th>
                  <th className="py-2 text-right">{data.simYears}年合計</th>
                </tr>
              </thead>
              <tbody>
                {data.suddenExpenses.map(e => {
                  const count = countSuddenExpenseOccurrences(data.simYears, e.cycleYears);
                  const total = count * e.amount;
                  return (
                    <tr key={e.id} className="border-b border-line-table">
                      <td className="py-2 pr-3 text-ink-main">{e.name || '—'}</td>
                      <td className="py-2 pr-3 text-right text-ink-sub">
                        {e.cycleYears > 0 ? `${e.cycleYears}年ごと` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">{fmtMan(e.amount)} 万</td>
                      <td className="py-2 pr-3 text-right tabular text-ink-sub">{count > 0 ? `${count}回` : '—'}</td>
                      <td className="py-2 text-right tabular font-medium">{fmtMan(total)} 万</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-status-danger/30 font-bold">
                  <td colSpan={4} className="py-2 pr-3 text-status-danger text-right">合計</td>
                  <td className="py-2 text-right tabular text-status-danger">{fmtMan(calc.lifeExpSudden)} 万</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ━━━━━━━━━ 資産推移グラフ ━━━━━━━━━ */}
      <Card title="📈 資産残高の推移">
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid stroke="#F1F0EC" />
              <XAxis dataKey="age" stroke="#787774" tickFormatter={v => `${v}歳`} />
              <YAxis yAxisId="left" stroke="#2D7DD2" tickFormatter={v => `${v.toLocaleString()}万`} />
              <YAxis yAxisId="right" orientation="right" stroke="#787774" tickFormatter={v => `${v.toLocaleString()}`} />
              <ReferenceLine yAxisId="left" y={0} stroke="#E55B4D" strokeDasharray="3 3" />
              <Tooltip
                formatter={(v: number, name: string) => [`${v.toLocaleString()}万円`, name]}
                labelFormatter={(label: any) => `${label}歳`}
              />
              <Legend />
              <Bar yAxisId="right" dataKey="年収入" fill="#3DAA7B" opacity={0.55} />
              <Bar yAxisId="right" dataKey="年支出" fill="#E55B4D" opacity={0.55} />
              <Line yAxisId="left" type="monotone" dataKey="残高" stroke="#2D7DD2" strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ━━━━━━━━━ ライフステージ別アドバイス ━━━━━━━━━ */}
      <Card title="💬 ライフステージ別 アドバイス">
        <div className="space-y-2.5">
          {advice.map((a, i) => {
            const cls = a.tone === 'good'   ? 'bg-status-ok/8 border-status-ok/30'
                      : a.tone === 'warn'   ? 'bg-status-warn/8 border-status-warn/30'
                      : a.tone === 'danger' ? 'bg-status-danger/8 border-status-danger/30'
                      : 'bg-accent-blue/8 border-accent-blue/30';
            return (
              <div key={i} className={`p-3 rounded-[10px] border ${cls}`}>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-base">{a.icon}</span>
                  <span className="text-xs font-bold text-ink-label uppercase tracking-wider">{a.stage}</span>
                </div>
                <div className="text-sm text-ink-main pl-7">{a.text}</div>
                {a.recommendation && (
                  <div className="text-sm font-bold text-accent-blue pl-7 mt-1">→ {a.recommendation}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ━━━━━━━━━ 年次推移表（詳細） ━━━━━━━━━ */}
      <Card title={`📋 年次推移表（${data.simYears}年）`}>
        <SimpleCashFlowTable rows={rows} hasSolar={rows.some(r => r.solarBenefit > 0)} />
      </Card>
    </div>
  );
}

// ─── ヘルパー: アドバイス生成 ───
type AdvItem = { stage: string; icon: string; tone: 'good' | 'normal' | 'warn' | 'danger'; text: string; recommendation?: string };
function generateAdvice(rows: YearRow[], data: SimData, _calc: CalcResult, peakEduRow: YearRow | null): AdvItem[] {
  const out: AdvItem[] = [];
  const b = data.basic;
  const retireAge = b.retireAge;
  const eduRows = rows.filter(r => r.eduCost >= 100);

  // 期間定義
  const periods: { name: string; from: number; to: number }[] = [];
  if (eduRows.length > 0) {
    const eduStart = eduRows[0].age;
    const eduEnd = eduRows[eduRows.length - 1].age;
    if (eduStart > b.age) periods.push({ name: '現役前半', from: b.age, to: eduStart - 1 });
    periods.push({ name: `教育費期`, from: eduStart, to: eduEnd });
    if (eduEnd + 1 < retireAge) periods.push({ name: '現役後半', from: eduEnd + 1, to: retireAge - 1 });
  } else {
    if (b.age < retireAge) periods.push({ name: '現役期', from: b.age, to: retireAge - 1 });
  }
  if (rows[rows.length - 1].age >= retireAge) periods.push({ name: '退職後', from: retireAge, to: rows[rows.length - 1].age });

  // 各期間の月平均余剰
  for (const p of periods) {
    const ps = rows.filter(r => r.age >= p.from && r.age <= p.to);
    if (ps.length === 0) continue;
    const monthAvg = ps.reduce((a, r) => a + r.net, 0) / ps.length / 12;
    const ageRange = `${p.from}〜${p.to}歳`;

    if (p.name.includes('教育費')) {
      out.push({
        stage: `📚 教育費期 (${ageRange})`,
        tone: 'warn',
        icon: '⚠',
        text: `月平均余剰 ${monthAvg >= 0 ? '+' : ''}${monthAvg.toFixed(1)} 万円。${peakEduRow ? `ピークは ${peakEduRow.age}歳 で年 ${fmtMan(peakEduRow.eduCost)}万円。` : ''}`,
        recommendation: monthAvg > 1
          ? `月 ${Math.max(1, Math.floor(monthAvg)).toFixed(0)} 万円 程度の貯金にとどめ、教育費に備える`
          : monthAvg >= 0
            ? '無理な貯金は避け、教育費捻出を優先'
            : `月 ${Math.abs(monthAvg).toFixed(1)} 万円 の取り崩しに注意。事前準備を`,
      });
    } else if (p.name.includes('退職後')) {
      out.push({
        stage: `🪙 退職後 (${ageRange})`,
        tone: monthAvg >= 0 ? 'good' : 'danger',
        icon: monthAvg >= 0 ? '✓' : '⚠',
        text: `年金収入で月平均 ${monthAvg >= 0 ? '+' : ''}${monthAvg.toFixed(1)} 万円。${monthAvg >= 0 ? '安定した老後生活が見込めます。' : '貯蓄を取り崩しながらの生活となります。'}`,
        recommendation: monthAvg >= 0
          ? '余裕があれば旅行・趣味への投資も可能'
          : '医療費・介護費の備えを早めに',
      });
    } else if (p.name.includes('前半')) {
      out.push({
        stage: `🌱 現役前半 (${ageRange})`,
        tone: monthAvg >= 5 ? 'good' : 'normal',
        icon: '✓',
        text: `月平均余剰 ${monthAvg >= 0 ? '+' : ''}${monthAvg.toFixed(1)} 万円。`,
        recommendation: monthAvg >= 5
          ? `月 ${Math.floor(monthAvg).toFixed(0)} 万円 の貯金を継続、教育費・老後資金の準備を`
          : '計画的な節約で貯蓄ペースを上げる',
      });
    } else if (p.name.includes('後半')) {
      out.push({
        stage: `🚀 現役後半 (${ageRange})`,
        tone: monthAvg >= 10 ? 'good' : 'normal',
        icon: '✓',
        text: `月平均余剰 ${monthAvg >= 0 ? '+' : ''}${monthAvg.toFixed(1)} 万円。教育費が落ち着き、貯蓄スピードが上がる時期。`,
        recommendation: monthAvg >= 10
          ? `月 ${Math.floor(monthAvg).toFixed(0)} 万円 を貯蓄・繰上返済へ。完済時期を早められます`
          : `月 ${Math.max(1, Math.floor(monthAvg)).toFixed(0)} 万円 をコツコツ貯蓄、老後資金を厚く`,
      });
    } else {
      out.push({
        stage: `🏃 現役期 (${ageRange})`,
        tone: monthAvg >= 0 ? 'good' : 'warn',
        icon: monthAvg >= 0 ? '✓' : '⚠',
        text: `月平均余剰 ${monthAvg >= 0 ? '+' : ''}${monthAvg.toFixed(1)} 万円。`,
        recommendation: monthAvg >= 5 ? `月 ${Math.floor(monthAvg).toFixed(0)} 万円 の貯金が可能` : '貯蓄計画の見直しを',
      });
    }
  }
  return out;
}

// ─── 小コンポーネント ───
function BigStat({ tone, label, value, note }: { tone: 'good' | 'bad'; label: string; value: string; note?: string }) {
  const cls = tone === 'good' ? 'bg-status-ok/10 border-status-ok/30 text-status-ok' : 'bg-status-danger/10 border-status-danger/30 text-status-danger';
  return (
    <div className={`rounded-[12px] border p-5 text-center ${cls}`}>
      <div className="text-[11px] font-bold tracking-wider">{label}</div>
      <div className="text-3xl font-bold tabular mt-1">
        {value}<span className="text-sm font-normal text-ink-sub ml-1">万円</span>
      </div>
      {note && <div className="text-[11px] text-ink-sub mt-1">{note}</div>}
    </div>
  );
}

function KPI({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: 'good' | 'bad' | 'normal' }) {
  const color = tone === 'good' ? 'text-status-ok' : tone === 'bad' ? 'text-status-danger' : 'text-ink-main';
  return (
    <div className="bg-bg-panel rounded-[10px] px-4 py-3">
      <div className="text-[11px] text-ink-label">{label}</div>
      <div className={`text-xl font-bold tabular mt-0.5 ${color}`}>
        {value}<span className="text-xs text-ink-sub font-normal ml-1">{unit}</span>
      </div>
    </div>
  );
}

function MeetingCheck({ label, value, text, tone }: { label: string; value: string; text: string; tone: 'good' | 'warn' | 'danger' }) {
  const cls = tone === 'good'
    ? 'bg-status-ok/8 border-status-ok/30 text-status-ok'
    : tone === 'warn'
      ? 'bg-status-warn/8 border-status-warn/30 text-status-warn'
      : 'bg-status-danger/8 border-status-danger/30 text-status-danger';
  return (
    <div className={`rounded-[10px] border p-4 ${cls}`}>
      <div className="text-[11px] font-bold tracking-wider">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
      <div className="text-xs text-ink-main leading-relaxed mt-2">{text}</div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-line-table last:border-b-0">
      <span className="text-ink-sub">{label}</span>
      <span className={`tabular font-medium ${highlight ? 'text-status-ok font-bold' : 'text-ink-main'}`}>
        {fmtMan(value)} <span className="text-xs text-ink-sub font-normal">万円</span>
      </span>
    </div>
  );
}

function LossDetailRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-line-table last:border-b-0 bg-status-warn/5 -mx-1 px-1 rounded">
      <span className="text-ink-sub">{label}</span>
      <span className="tabular font-bold text-status-danger">
        -{fmtMan(value)} <span className="text-xs text-ink-sub font-normal">万円</span>
      </span>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-[8px] px-3 py-2 ${accent ? 'bg-accent-blue/10 border border-accent-blue/30' : 'bg-bg-panel'}`}>
      <div className="text-[10px] text-ink-label tracking-wider">{label}</div>
      <div className={`text-base font-bold tabular mt-0.5 ${accent ? 'text-accent-blue' : 'text-ink-main'}`}>{value}</div>
    </div>
  );
}

// ─── 教育費 子どもごと内訳 ───
const EDU_ANNUAL_LOCAL: Record<string, number> = {
  '公立中学': 52.9, '私立中学': 143.6,
  '公立高校': 51.3, '私立高校': 105.4,
  '国公立大学': 60.7, '私立文系': 93.5, '私立理系': 129.3,
  '専門学校(2年)': 100, '専門学校(3年)': 90, '就職': 0,
};
const EDU_YEARS_LOCAL: Record<string, number> = {
  '公立中学': 3, '私立中学': 3,
  '公立高校': 3, '私立高校': 3,
  '国公立大学': 4, '私立文系': 4, '私立理系': 4,
  '専門学校(2年)': 2, '専門学校(3年)': 3, '就職': 0,
};
const KID_KEYS_LOCAL = [
  { age: 'c1age', mid: 'c1mid', high: 'c1high', uni: 'c1uni', alone: 'c1alone' },
  { age: 'c2age', mid: 'c2mid', high: 'c2high', uni: 'c2uni', alone: 'c2alone' },
  { age: 'c3age', mid: 'c3mid', high: 'c3high', uni: 'c3uni', alone: 'c3alone' },
] as const;

function KidsEduTable({ data }: { data: SimData }) {
  const b = data.basic;
  const kids = Math.min(3, Math.max(0, b.kids));
  const rows = Array.from({ length: kids }).map((_, idx) => {
    const k = KID_KEYS_LOCAL[idx];
    const mid = b[k.mid] as string;
    const high = b[k.high] as string;
    const uni = b[k.uni] as string;
    const alone = b[k.alone] as number;
    const midTotal = (EDU_ANNUAL_LOCAL[mid] ?? 0) * (EDU_YEARS_LOCAL[mid] ?? 0);
    const highTotal = (EDU_ANNUAL_LOCAL[high] ?? 0) * (EDU_YEARS_LOCAL[high] ?? 0);
    const uniTotal = (EDU_ANNUAL_LOCAL[uni] ?? 0) * (EDU_YEARS_LOCAL[uni] ?? 0);
    const aloneTotal = b.aloneMonthly * 12 * alone;
    return { idx, mid, high, uni, alone, midTotal, highTotal, uniTotal, aloneTotal, total: midTotal + highTotal + uniTotal + aloneTotal };
  });
  const grand = rows.reduce((a, r) => a + r.total, 0);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-ink-label border-b border-line-table text-xs">
            <th className="py-2 text-left pr-3">お子様</th>
            <th className="py-2 text-left pr-3">中学</th>
            <th className="py-2 text-left pr-3">高校</th>
            <th className="py-2 text-left pr-3">大学等</th>
            <th className="py-2 text-right pr-3">中</th>
            <th className="py-2 text-right pr-3">高</th>
            <th className="py-2 text-right pr-3">大</th>
            <th className="py-2 text-right pr-3">仕送</th>
            <th className="py-2 text-right">合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.idx} className="border-b border-line-table">
              <td className="py-2 pr-3 text-ink-main">第{r.idx + 1}子</td>
              <td className="py-2 pr-3 text-xs text-ink-sub">{r.mid}</td>
              <td className="py-2 pr-3 text-xs text-ink-sub">{r.high}</td>
              <td className="py-2 pr-3 text-xs text-ink-sub">{r.uni}</td>
              <td className="py-2 pr-3 text-right tabular">{fmtMan(r.midTotal)}</td>
              <td className="py-2 pr-3 text-right tabular">{fmtMan(r.highTotal)}</td>
              <td className="py-2 pr-3 text-right tabular">{fmtMan(r.uniTotal)}</td>
              <td className="py-2 pr-3 text-right tabular">{fmtMan(r.aloneTotal)}</td>
              <td className="py-2 text-right tabular font-bold text-accent-blue">{fmtMan(r.total)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-accent-blue/30 font-bold">
            <td colSpan={8} className="py-2 pr-3 text-accent-blue text-right">教育費 合計</td>
            <td className="py-2 text-right tabular text-accent-blue">{fmtMan(grand)} 万</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── 詳細キャッシュフロー表（収入2項目・支出7項目） ───
//   グループ化ヘッダーで「収入(+) / 支出(-) / 結果」を視覚的に分離
//   メンテと急な出費は別カラムで表示（メンテ=計画支出 / 急な出費=フリー入力）
function SimpleCashFlowTable({ rows, hasSolar }: { rows: YearRow[]; hasSolar: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs tabular border-collapse">
        <thead className="sticky top-0 bg-bg-card z-10">
          {/* グループ行 */}
          <tr className="text-[10px] text-ink-label">
            <th rowSpan={2} className="py-2 px-2 font-bold text-left whitespace-nowrap border-b-2 border-line-card border-r border-line-table">年齢</th>
            <th colSpan={hasSolar ? 3 : 2} className="py-1.5 px-2 text-center font-bold text-status-ok bg-status-ok/8 border-b border-status-ok/30 tracking-widest uppercase">＋ 収入</th>
            <th colSpan={7} className="py-1.5 px-2 text-center font-bold text-status-danger bg-status-danger/8 border-b border-status-danger/30 border-l-2 border-line-card tracking-widest uppercase">− 支出</th>
            <th rowSpan={2} className="py-2 px-2 font-bold text-right whitespace-nowrap border-b-2 border-line-card border-l-2 border-line-card bg-accent-blue/5">収支</th>
            <th rowSpan={2} className="py-2 px-2 font-bold text-right whitespace-nowrap border-b-2 border-line-card bg-accent-blue/5">💰 残高</th>
            <th rowSpan={2} className="py-2 px-2 font-bold text-left whitespace-nowrap border-b-2 border-line-card">特記事項</th>
          </tr>
          {/* サブヘッダー */}
          <tr className="text-[10px] text-ink-label border-b-2 border-line-card">
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-ok/4">手取り</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-ok/4">🏛 ロー減税</th>
            {hasSolar && <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-ok/4">☀ 太陽光</th>}
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4 border-l-2 border-line-card">🏠 ローン</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">🏛 固資</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">💡 光熱費</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">🛒 生活費</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">🎓 教育費</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">🔧 メンテ</th>
            <th className="py-2 px-2 font-medium text-right whitespace-nowrap bg-status-danger/4">💸 急な出費</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const balColor = r.balance < 0 ? 'text-status-danger' : 'text-accent-blue';
            return (
              <tr key={r.year} className="border-b border-line-table hover:bg-bg-panel/40">
                <td className="py-1.5 px-2 font-medium whitespace-nowrap border-r border-line-table">{r.age}歳</td>
                {/* 収入 */}
                {/* 手取り = 給与/年金 + 退職金 + 貯蓄型保険受取（ロー減税は別列に分離） */}
                <td className="py-1.5 px-2 text-right whitespace-nowrap font-medium">{fmtMan(r.income - r.taxBack)}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap text-status-ok">
                  {r.taxBack > 0 ? `+${fmtMan(r.taxBack)}` : '-'}
                </td>
                {hasSolar && (
                  <td className="py-1.5 px-2 text-right whitespace-nowrap text-status-ok">
                    {r.solarBenefit > 0 ? `+${fmtMan(r.solarBenefit)}` : '-'}
                  </td>
                )}
                {/* 支出 */}
                <td className="py-1.5 px-2 text-right whitespace-nowrap border-l-2 border-line-card">
                  {r.loanPay > 0 ? fmtMan(r.loanPay) : '-'}
                </td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">{r.propTax > 0 ? fmtMan(r.propTax) : '-'}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">{r.utility > 0 ? fmtMan(r.utility) : '-'}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">{r.living > 0 ? fmtMan(r.living) : '-'}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">{r.eduCost > 0 ? fmtMan(r.eduCost) : '-'}</td>
                <td className={`py-1.5 px-2 text-right whitespace-nowrap ${r.maintCost > 0 ? 'text-status-warn font-semibold' : ''}`}>
                  {r.maintCost > 0 ? fmtMan(r.maintCost) : '-'}
                </td>
                <td className={`py-1.5 px-2 text-right whitespace-nowrap ${r.sudden > 0 ? 'text-status-danger font-semibold' : ''}`}>
                  {r.sudden > 0 ? fmtMan(r.sudden) : '-'}
                </td>
                {/* 結果 */}
                <td className={`py-1.5 px-2 text-right whitespace-nowrap border-l-2 border-line-card bg-accent-blue/3 ${r.net < 0 ? 'text-status-danger font-semibold' : 'text-ink-main font-medium'}`}>
                  {r.net >= 0 ? '+' : ''}{fmtMan(r.net)}
                </td>
                <td className={`py-1.5 px-2 text-right whitespace-nowrap text-base font-bold bg-accent-blue/3 ${balColor}`}>
                  {fmtMan(r.balance)}
                </td>
                <td className="py-1.5 px-2 max-w-[260px] truncate text-ink-sub" title={r.events.join(' / ')}>
                  {r.events.join(' / ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* 凡例 */}
      <div className="mt-3 px-2 text-[10px] text-ink-sub flex flex-wrap gap-x-4 gap-y-1">
        <span>📌 単位: 万円</span>
        <span>手取り = 給与/年金 + 退職金 + 貯蓄型保険受取</span>
        <span>🏛 ロー減税 = 住宅ローン控除（年末残高 × 0.7%・上限あり・入居後 10〜13 年）</span>
        <span>🔧 メンテ = 計画メンテナンス費（外壁・屋根・給湯器など）</span>
        <span>💸 急な出費 = フリー入力した周期的支出（車買い替え・家電一新など）</span>
        <span>☀ 太陽光 = 自家消費による節電 + 売電収入</span>
      </div>
    </div>
  );
}

// 旧 CashFlowTable はそのまま公開（他から import される可能性）
export function CashFlowTable({ rows }: { rows: YearRow[] }) {
  return <SimpleCashFlowTable rows={rows} hasSolar={rows.some(r => r.solarBenefit > 0)} />;
}
