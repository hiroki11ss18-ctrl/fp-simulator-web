import { forwardRef } from 'react';
import type { SimData, CalcResult, YearRow } from '../types';
import { fmtMan, fmt } from '../lib/format';
import { getSuddenExpenseOccurrenceYears } from '../lib/suddenExpenses';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Props { data: SimData; calc: CalcResult }

// ─── 推奨貯蓄プラン: 期間ごとの目標年間貯蓄額を生成 ───
type SavingsPhase = {
  name: string;
  icon: string;
  fromAge: number;
  toAge: number;
  annualTarget: number;     // 目標 万円/年（avg net）
  monthlyTarget: number;    // 目標 万円/月
  reason: string;
};

function generateSavingsPlan(rows: YearRow[], data: SimData): SavingsPhase[] {
  const out: SavingsPhase[] = [];
  const b = data.basic;
  const retireAge = b.retireAge;
  const eduRows = rows.filter(r => r.eduCost >= 100);

  const periods: { name: string; icon: string; from: number; to: number; reason: string }[] = [];

  if (eduRows.length > 0) {
    const eduStart = eduRows[0].age;
    const eduEnd = eduRows[eduRows.length - 1].age;
    if (eduStart > b.age) {
      periods.push({
        name: '教育費前（積極貯蓄期）', icon: '🌱',
        from: b.age, to: eduStart - 1,
        reason: '教育費が始まる前の貯蓄ゴールデンタイム。住宅ローン控除・太陽光効果が効く時期で、家計に最も余裕があります。教育費や繰上返済の原資をここで作っておくのが理想です。'
      });
    }
    periods.push({
      name: '教育費期', icon: '📚',
      from: eduStart, to: eduEnd,
      reason: '教育費がピークの時期で、家計が圧迫されます。無理な貯蓄目標は禁物。プラスを維持できれば優秀、マイナスでも事前貯蓄を取り崩して乗り切る前提でOKです。'
    });
    if (eduEnd + 1 < retireAge) {
      periods.push({
        name: '教育費卒業後（老後資金ラストスパート）', icon: '🚀',
        from: eduEnd + 1, to: retireAge - 1,
        reason: '教育費が終わり、給与もピーク付近。老後資金準備の最後の山場です。月々の余剰を最大限、貯蓄や繰上返済に回すことを推奨します。'
      });
    }
  } else {
    if (b.age < retireAge) {
      periods.push({
        name: '現役期', icon: '🌱',
        from: b.age, to: retireAge - 1,
        reason: '現役時代に積極貯蓄。月平均の余剰額をベースに目標を設定します。'
      });
    }
  }

  if (rows[rows.length - 1].age >= retireAge) {
    periods.push({
      name: '退職後（年金生活）', icon: '🪙',
      from: retireAge, to: rows[rows.length - 1].age,
      reason: '年金収入のみ。これまでの貯蓄を計画的に取り崩しながら、医療・介護費に備える時期。余剰がプラスなら旅行・趣味への投資も可能です。'
    });
  }

  for (const p of periods) {
    const ps = rows.filter(r => r.age >= p.from && r.age <= p.to);
    if (ps.length === 0) continue;
    const avgNet = ps.reduce((a, r) => a + r.net, 0) / ps.length;
    out.push({
      name: p.name,
      icon: p.icon,
      fromAge: p.from,
      toAge: p.to,
      annualTarget: Math.round(avgNet),
      monthlyTarget: Math.round(avgNet / 12 * 10) / 10,
      reason: p.reason,
    });
  }

  return out;
}

// ─── 繰上返済アドバイス ───
type PrepayAdvice = {
  yearTarget: number;       // 繰上実施年（経過年）
  ageAtPrepay: number;
  amount: number;           // 繰上額（万円）
  yearsToSave: number;      // 残り何年で貯めるか
  annualTarget: number;     // 年間貯蓄目標
  monthlyTarget: number;    // 月間貯蓄目標
};

type SuddenExpensePlan = {
  id: string;
  name: string;
  cycleYears: number;
  amount: number;
  rows: YearRow[];
  total: number;
};

function generatePrepayAdvice(data: SimData): PrepayAdvice[] {
  const b = data.basic;
  const l = data.loan;
  const list: { year: number; amount: number }[] = [];
  if (l.pyear > 0 && l.pamount > 0) list.push({ year: l.pyear, amount: l.pamount });
  if (l.pyear2 > 0 && l.pamount2 > 0) list.push({ year: l.pyear2, amount: l.pamount2 });

  return list.map(p => {
    const yearsToSave = Math.max(1, p.year);
    const annualTarget = p.amount / yearsToSave;
    return {
      yearTarget: p.year,
      ageAtPrepay: b.age + p.year,
      amount: p.amount,
      yearsToSave,
      annualTarget: Math.round(annualTarget * 10) / 10,
      monthlyTarget: Math.round(annualTarget / 12 * 10) / 10,
    };
  });
}

function generateSuddenExpensePlan(data: SimData, rows: YearRow[]): SuddenExpensePlan[] {
  const rowByYear = new Map(rows.map(r => [r.year, r]));

  return (data.suddenExpenses ?? [])
    .filter(e => e.amount > 0 && e.cycleYears > 0)
    .map(e => {
      const occurrenceRows = getSuddenExpenseOccurrenceYears(data.simYears, e.cycleYears)
        .map(year => rowByYear.get(year))
        .filter((row): row is YearRow => Boolean(row));

      return {
        id: e.id,
        name: e.name || '臨時支出',
        cycleYears: e.cycleYears,
        amount: e.amount,
        rows: occurrenceRows,
        total: occurrenceRows.length * e.amount,
      };
    })
    .filter(e => e.rows.length > 0);
}

const PrintProposal = forwardRef<HTMLDivElement, Props>(({ data, calc }, ref) => {
  const rows = calc.rows.slice(0, data.simYears);
  const chart = rows.map(r => ({ age: r.age, 残高: Math.round(r.balance) }));
  const savingsPlan = generateSavingsPlan(rows, data);
  const prepayAdvice = generatePrepayAdvice(data);
  const suddenExpensePlan = generateSuddenExpensePlan(data, rows);
  const annualLifestyleRows = rows.map(row => {
    const income = row.income + row.solarBenefit;
    const livingAndUtility = row.living + row.utility;
    const educationAndSudden = row.eduCost + row.sudden;
    const expense = row.loanPay + row.propTax + livingAndUtility + educationAndSudden + row.maintCost;
    return { row, income, livingAndUtility, educationAndSudden, expense };
  });
  const totalLifestyleIncome = annualLifestyleRows.reduce((sum, item) => sum + item.income, 0);
  const totalLifestyleExpense = annualLifestyleRows.reduce((sum, item) => sum + item.expense, 0);
  const endRow = rows[rows.length - 1];
  const minBalanceRow = rows.length > 0
    ? rows.reduce((lowest, row) => row.balance < lowest.balance ? row : lowest)
    : undefined;

  // 金利情報
  const l = data.loan;
  const loanTypeLabel = l.loanType === 'var' ? '変動金利' : '固定金利';
  const rates = l.loanType === 'var'
    ? [l.varRate1, l.varRate2, l.varRate3]
    : [l.fixRate1, l.fixRate2, l.fixRate3];
  const periodEnds = l.loanType === 'var'
    ? [l.varPeriod1, l.varPeriod2]
    : [l.fixPeriod1, l.fixPeriod2];

  // 月返済 1期/2期/3期（calc から取得、未計算なら calc.monthly でフォールバック）
  const m1 = calc.monthlyPhase1 > 0 ? calc.monthlyPhase1 : calc.monthly;
  const m2 = calc.monthlyPhase2;
  const m3 = calc.monthlyPhase3;
  const loanEndsAfterRetirement = calc.completionAge > data.basic.retireAge;
  const hasBalanceShortfall = (minBalanceRow?.balance ?? 0) < 0;
  const conclusion = buildProposalConclusion({
    data,
    calc,
    endRow,
    minBalanceRow,
    loanEndsAfterRetirement,
    hasBalanceShortfall,
    suddenExpenseCount: suddenExpensePlan.length,
  });

  return (
    <div ref={ref} className="bg-white text-[#37352F] p-8" style={{ width: '190mm' }}>
      <header className="border-b-2 border-[#2D7DD2] pb-3 mb-4 flex justify-between items-end">
        <div>
          <div className="text-xs text-[#787774]">アイ工務店</div>
          <h1 className="text-2xl font-bold">住まいのFPシミュレーション提案書</h1>
          <div className="text-[10px] text-[#2D7DD2] font-semibold mt-1">住まいと暮らしを一緒に見通す資金計画</div>
        </div>
        <div className="text-right text-xs">
          <div>顧客名：<strong className="text-base">{data.basic.customerName || '—'}</strong> 様</div>
          <div>担当者：{data.basic.staffName || '—'}</div>
          <div>作成日：{data.basic.date}</div>
        </div>
      </header>

      {/* ① 今回の計画 */}
      <section className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="住宅総費用" value={fmtMan(calc.totalCost)} />
        <Stat label="借入額" value={fmtMan(calc.loan)} />
        <Stat label={`${data.simYears}年後の資産残高`} value={fmtMan(endRow?.balance ?? 0)} tone={(endRow?.balance ?? 0) < 0 ? 'expense' : 'income'} />
      </section>

      <section className="mb-4 border-l-4 border-[#2D7DD2] bg-[#E8F4FA] px-4 py-3" style={{ pageBreakInside: 'avoid' }}>
        <div className="text-[10px] font-bold text-[#2D7DD2] tracking-wider mb-1">今回の計画の結論</div>
        <div className="text-sm font-bold text-[#37352F]">{conclusion.title}</div>
        <div className="text-[10px] text-[#5D5B57] leading-relaxed mt-1">{conclusion.detail}</div>
      </section>

      {/* ② 月々返済額（3期表示・金利タイプ明記） */}
      <section className="mb-5 bg-[#EFEDE9] rounded p-3" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-bold text-[#37352F]">月々の返済額</div>
          <div className="text-[10px] text-[#787774]">
            <span className="bg-[#2D7DD2] text-white px-1.5 py-0.5 rounded font-bold mr-1">{loanTypeLabel}</span>
            実質返済期間 {calc.repaymentYears}年 / 完済 {calc.completionAge}歳
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <PhaseBox
            phase={1} startY={0} endY={periodEnds[0]}
            rate={rates[0]} monthly={m1}
          />
          <PhaseBox
            phase={2} startY={periodEnds[0]} endY={periodEnds[1]}
            rate={rates[1]} monthly={m2}
          />
          <PhaseBox
            phase={3} startY={periodEnds[1]} endY={l.years}
            rate={rates[2]} monthly={m3}
          />
        </div>
        <div className="text-[9px] text-[#787774] mt-2">
          ※ 金利の見通し、ボーナス払い、繰上返済を反映した概算です。実際の返済額は借入時の条件で確定します。
        </div>
      </section>

      {/* ③ 資産残高グラフ */}
      <section className="mb-4" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-sm font-bold mb-1 text-[#2D7DD2]">資産残高の推移</h2>
        <div className="h-44">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ left: 10, right: 10, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#E9E8E3" />
              <XAxis dataKey="age" stroke="#787774" tickFormatter={v => `${v}歳`} />
              <YAxis stroke="#787774" tickFormatter={v => `${v.toLocaleString()}`} />
              <ReferenceLine y={0} stroke="#E55B4D" strokeDasharray="3 3" />
              {data.basic.retireAge >= data.basic.age && data.basic.retireAge <= (endRow?.age ?? data.basic.age) && (
                <ReferenceLine x={data.basic.retireAge} stroke="#C78000" strokeDasharray="3 3" label={{ value: '定年', position: 'top', fill: '#C78000', fontSize: 10 }} />
              )}
              {calc.completionAge >= data.basic.age && calc.completionAge <= (endRow?.age ?? data.basic.age) && (
                <ReferenceLine x={calc.completionAge} stroke="#3DAA7B" strokeDasharray="3 3" label={{ value: '完済', position: 'top', fill: '#3DAA7B', fontSize: 10 }} />
              )}
              <Tooltip formatter={(v: number) => `${v.toLocaleString()}万円`} />
              <Line type="monotone" dataKey="残高" stroke="#2D7DD2" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ④ このプランで確認すること */}
      <section className="mb-4 grid grid-cols-3 gap-2" style={{ pageBreakInside: 'avoid' }}>
        <ProposalPoint
          label="手元資金が最も少ない時期"
          value={minBalanceRow ? `${minBalanceRow.age}歳 / ${fmtMan(minBalanceRow.balance)}` : '—'}
          tone={hasBalanceShortfall ? 'danger' : (minBalanceRow?.balance ?? 0) < 500 ? 'warn' : 'good'}
          detail={hasBalanceShortfall ? 'この時期までに支出か借入条件の調整が必要です。' : '教育費・車などの予定支出を入れた上での最低残高です。'}
        />
        <ProposalPoint
          label="住宅ローンの完済時期"
          value={`${calc.completionAge}歳`}
          tone={loanEndsAfterRetirement ? 'warn' : 'good'}
          detail={loanEndsAfterRetirement ? `定年${data.basic.retireAge}歳後にも返済が残る計画です。` : `定年${data.basic.retireAge}歳より前に完済する計画です。`}
        />
        <ProposalPoint
          label="大型支出の備え"
          value={suddenExpensePlan.length > 0 ? `${suddenExpensePlan.length}項目を反映` : '未登録'}
          tone={suddenExpensePlan.length > 0 ? 'good' : 'warn'}
          detail={suddenExpensePlan.length > 0 ? '車買い替えなどを資産残高に織り込んでいます。' : '車・家電など、定期的な大きい支出も確認します。'}
        />
      </section>

      {/* ⑤ 家計の時期別の見通し */}
      {savingsPlan.length > 0 && (
        <section className="mb-4" style={{ pageBreakInside: 'avoid' }}>
          <h2 className="text-sm font-bold mb-2 text-[#2D7DD2]">家計の時期別の見通し</h2>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-[#EFEDE9] text-left">
                <th className="px-2 py-1.5 w-52">時期</th>
                <th className="px-2 py-1.5 text-right w-24">月平均の収支</th>
                <th className="px-2 py-1.5">この時期の考え方</th>
              </tr>
            </thead>
            <tbody>
              {savingsPlan.map((p, i) => {
                const monthlyTarget = Math.abs(p.monthlyTarget) < 0.05 ? 0 : p.monthlyTarget;
                const isDeficit = monthlyTarget < 0;
                return (
                  <tr key={i} className="border-b border-[#F1F0EC] align-top" style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-2 py-1.5">
                      <div className="font-bold text-[11px]">{p.icon} {p.name}</div>
                      <div className="text-[9px] text-[#787774]">{p.fromAge}〜{p.toAge}歳</div>
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular font-bold ${isDeficit ? 'text-[#E55B4D]' : 'text-[#3DAA7B]'}`}>
                      {monthlyTarget > 0 ? '+' : ''}{fmt(monthlyTarget, 1)}<span className="text-[9px] font-normal text-[#787774] ml-0.5">万/月</span>
                    </td>
                    <td className="px-2 py-1.5 text-[10px] leading-relaxed">{p.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[9px] text-[#787774] mt-2 leading-relaxed">
            📌 月平均の収支は、各時期の平均的な「収入 − 支出」です。マイナスの期間は、前もって準備した貯蓄からの取り崩しも含めて考えます。
          </div>
        </section>
      )}

      {/* ⑥ 繰上返済プラン（設定がある場合のみ） */}
      {prepayAdvice.length > 0 && (
        <section className="mb-4 bg-[#E8F4FA] border border-[#2D7DD2]/30 rounded p-3" style={{ pageBreakInside: 'avoid' }}>
          <h2 className="text-sm font-bold mb-2 text-[#2D7DD2]">⏩ 繰上返済プラン</h2>
          <div className="space-y-2">
            {prepayAdvice.map((p, i) => (
              <div key={i} className="bg-white rounded p-2.5 border border-[#E9E8E3]" style={{ pageBreakInside: 'avoid' }}>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[11px] font-bold">
                    {p.yearTarget}年目（{p.ageAtPrepay}歳）に <span className="text-[#2D7DD2]">{fmtMan(p.amount)}万円</span> を繰上返済
                  </div>
                  <div className="text-[9px] text-[#787774]">残り {p.yearsToSave} 年で貯める</div>
                </div>
                <div className="text-[10px] text-[#37352F] leading-relaxed">
                  この目標達成には、現在から <strong>年間 {fmt(p.annualTarget, 1)} 万円（月 {fmt(p.monthlyTarget, 1)} 万円）</strong> のペースで貯蓄が必要です。
                </div>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-[#787774] mt-2 leading-relaxed">
            💡 <strong>繰上返済の効果</strong>: 完済が早まり、その後の月返済が消える分、定年後の生活余裕が大きく改善します。
            金利が高い時期や残高が大きい初期に繰上返済するほど、利息軽減効果が大きくなります。
          </div>
        </section>
      )}

      {/* ⑦ ライフスタイル・年間収支 — Page 2 から開始 */}
      <section className="mb-4" style={{ pageBreakBefore: 'always' }}>
        <h2 className="text-sm font-bold mb-1 text-[#2D7DD2]">ライフスタイル・年間収支</h2>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <LifestyleStat label={`${data.simYears}年間の収入合計`} value={fmtMan(totalLifestyleIncome)} tone="income" />
          <LifestyleStat label={`${data.simYears}年間の支出合計`} value={fmtMan(totalLifestyleExpense)} tone="expense" />
          <LifestyleStat label={`${data.simYears}年後の資産残高`} value={fmtMan(endRow?.balance ?? 0)} tone={(endRow?.balance ?? 0) < 0 ? 'expense' : 'income'} />
        </div>

        <div className="text-[9px] text-[#787774] mb-1">
          収入は給与・年金・退職金・住宅ローン控除・太陽光効果などを含み、支出は毎年の家計にかかる費用をまとめて表示しています。単位: 万円
          <span className="ml-3 text-[#2D7DD2] font-semibold">■ 青: 収入・残高</span>
          <span className="ml-2 text-[#E55B4D] font-semibold">■ 赤: 支出</span>
        </div>
        <table className="w-full text-[8px] tabular border-collapse">
          <thead style={{ display: 'table-header-group' }}>
            <tr className="bg-[#EFEDE9] text-left">
              <th className="px-1 py-1 w-12">年齢</th>
              <th className="px-1 py-1 text-right text-[#2D7DD2]">収入</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">ローン</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">固資</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">光熱・生活</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">教育・急出費</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">メンテ</th>
              <th className="px-1 py-1 text-right text-[#E55B4D]">支出計</th>
              <th className="px-1 py-1 text-right">年間収支</th>
              <th className="px-1 py-1 text-right">残高</th>
            </tr>
          </thead>
          <tbody>
            {annualLifestyleRows.map(({ row, income, livingAndUtility, educationAndSudden, expense }) => (
              <tr key={row.year} className="border-b border-[#F1F0EC]" style={{ pageBreakInside: 'avoid' }}>
                <td className="px-1 py-0.5 text-[#787774] whitespace-nowrap">{row.age}歳</td>
                <td className="px-1 py-0.5 text-right text-[#2D7DD2] font-semibold">{fmtMan(income)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D]">{fmtMan(row.loanPay)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D]">{fmtMan(row.propTax)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D]">{fmtMan(livingAndUtility)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D]">{fmtMan(educationAndSudden)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D]">{fmtMan(row.maintCost)}</td>
                <td className="px-1 py-0.5 text-right text-[#E55B4D] font-semibold">{fmtMan(expense)}</td>
                <td className={`px-1 py-0.5 text-right font-semibold ${row.net < 0 ? 'text-[#E55B4D]' : 'text-[#2D7DD2]'}`}>{row.net > 0 ? '+' : ''}{fmtMan(row.net)}</td>
                <td className={`px-1 py-0.5 text-right font-bold ${row.balance < 0 ? 'text-[#E55B4D]' : 'text-[#2D7DD2]'}`}>{fmtMan(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ⑧ 急な出費・イベント費用の期間合計 */}
      <section className="mb-4" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-sm font-bold mb-1 text-[#2D7DD2]">急な出費・イベント費用の合計</h2>
        <div className="text-[9px] text-[#787774] mb-1">{data.simYears}年間のシミュレーション内でかかる合計です。発生する年の細かい一覧は省き、全体像を見やすくしています。</div>
        {suddenExpensePlan.length > 0 ? (
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-[#EFEDE9] text-left">
                <th className="px-1.5 py-1">項目</th>
                <th className="px-1.5 py-1 text-right">周期</th>
                <th className="px-1.5 py-1 text-right">期間内の回数</th>
                <th className="px-1.5 py-1 text-right">1回金額</th>
                <th className="px-1.5 py-1 text-right text-[#E55B4D]">期間内合計</th>
              </tr>
            </thead>
            <tbody>
              {suddenExpensePlan.map(e => (
                <tr key={e.id} className="border-b border-[#F1F0EC]">
                  <td className="px-1.5 py-1 font-bold">{e.name}</td>
                  <td className="px-1.5 py-1 text-right text-[#787774]">{e.cycleYears}年ごと</td>
                  <td className="px-1.5 py-1 text-right">{e.rows.length}回</td>
                  <td className="px-1.5 py-1 text-right text-[#E55B4D]">{fmtMan(e.amount)}</td>
                  <td className="px-1.5 py-1 text-right tabular font-bold text-[#E55B4D]">{fmtMan(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-[10px] text-[#787774] border border-[#E9E8E3] rounded px-2 py-2">車・旅行・家電などの周期支出は、急な出費に登録するとここへ合計表示されます。</div>
        )}
      </section>

      <footer className="mt-4 pt-2 border-t border-[#E9E8E3] text-[9px] text-[#787774] flex justify-between">
        <span>本資料は参考シミュレーションです。実際の金利・税制・物価等の変動により結果は変わります。</span>
        <span>© アイ工務店</span>
      </footer>
    </div>
  );
});

PrintProposal.displayName = 'PrintProposal';
export default PrintProposal;

// ─── 月返済 期別カード ───
function PhaseBox({ phase, startY, endY, rate, monthly }: {
  phase: 1 | 2 | 3; startY: number; endY: number; rate: number; monthly: number;
}) {
  const yearsLabel = `${startY}〜${endY}年`;
  const valid = monthly > 0 && endY > startY;
  return (
    <div className="bg-white rounded border border-[#E9E8E3] px-2 py-1.5">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[9px] font-bold text-[#787774] tracking-wider">PHASE {phase}</span>
        <span className="text-[9px] text-[#787774] tabular">{rate}%</span>
      </div>
      <div className="text-[8px] text-[#787774] mb-0.5">{yearsLabel}</div>
      {valid ? (
        <div className="text-base font-bold tabular text-[#2D7DD2] leading-tight">
          {fmt(monthly, 2)}<span className="text-[9px] font-normal text-[#787774] ml-0.5">万円/月</span>
        </div>
      ) : (
        <div className="text-xs text-[#787774]">—</div>
      )}
    </div>
  );
}

// ─── サマリー Stat ───
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'text-[#2D7DD2]' : tone === 'expense' ? 'text-[#E55B4D]' : 'text-[#37352F]';
  return (
    <div className="bg-[#EFEDE9] border-t-2 border-[#2D7DD2] rounded px-3 py-2">
      <div className="text-[10px] text-[#787774]">{label}</div>
      <div className={`text-base font-bold tabular ${color}`}>{value} <span className="text-[10px] font-normal text-[#787774]">万円</span></div>
    </div>
  );
}

function LifestyleStat({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'text-[#2D7DD2]' : 'text-[#E55B4D]';
  return (
    <div className="bg-[#EFEDE9] rounded px-3 py-2">
      <div className="text-[10px] text-[#787774]">{label}</div>
      <div className={`text-base font-bold tabular ${color}`}>{value} <span className="text-[10px] font-normal text-[#787774]">万円</span></div>
    </div>
  );
}

function ProposalPoint({ label, value, detail, tone }: {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warn' | 'danger';
}) {
  const color = tone === 'good' ? 'text-[#3DAA7B]' : tone === 'warn' ? 'text-[#C78000]' : 'text-[#E55B4D]';
  return (
    <div className="border border-[#E9E8E3] rounded p-2.5">
      <div className="text-[9px] text-[#787774] mb-1">{label}</div>
      <div className={`text-sm font-bold tabular mb-1 ${color}`}>{value}</div>
      <div className="text-[9px] text-[#787774] leading-relaxed">{detail}</div>
    </div>
  );
}

function buildProposalConclusion({
  data,
  calc,
  endRow,
  minBalanceRow,
  loanEndsAfterRetirement,
  hasBalanceShortfall,
  suddenExpenseCount,
}: {
  data: SimData;
  calc: CalcResult;
  endRow: YearRow | undefined;
  minBalanceRow: YearRow | undefined;
  loanEndsAfterRetirement: boolean;
  hasBalanceShortfall: boolean;
  suddenExpenseCount: number;
}) {
  if (hasBalanceShortfall && minBalanceRow) {
    return {
      title: `${minBalanceRow.age}歳ごろに資産残高がマイナスになる見通しです。`,
      detail: '借入額・毎月の生活費・教育費・大型支出の優先順位を確認し、家づくりの前に資金計画を調整しましょう。',
    };
  }

  const assetText = `${data.simYears}年後の資産残高は ${fmtMan(endRow?.balance ?? 0)}万円`;
  const loanText = loanEndsAfterRetirement
    ? `住宅ローンは ${calc.completionAge}歳で完済する見通しです。`
    : `住宅ローンは定年前の ${calc.completionAge}歳で完済する見通しです。`;
  const expenseText = suddenExpenseCount > 0
    ? `車などの大型支出 ${suddenExpenseCount}項目も反映しています。`
    : '車・旅行・家電などの大型支出は、決まり次第追加して確認します。';

  return {
    title: `${assetText}。${loanText}`,
    detail: `${expenseText} 定年・教育費・メンテナンスの時期に、手元資金が薄くならないかをこの提案書で確認できます。`,
  };
}
