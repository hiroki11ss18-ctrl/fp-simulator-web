import { Card, Field, NumInput, Select, StatBox } from '../ui';
import type { SimData, CalcResult, HouseholdExpenses, BasicInfo as BI } from '../../types';
import { fmtMan, fmt } from '../../lib/format';
import { calcSuddenExpenseTotal } from '../../lib/suddenExpenses';
import { takeHomeRate, estimatePensionMonthly } from '../../hooks/useCalculations';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const MID_OPTIONS = [
  { value: '公立中学', label: '公立中学' },
  { value: '私立中学', label: '私立中学' },
];
const HIGH_OPTIONS = [
  { value: '公立高校', label: '公立高校' },
  { value: '私立高校', label: '私立高校' },
];
const UNI_OPTIONS = [
  { value: '国公立大学', label: '国公立大学' },
  { value: '私立文系', label: '私立文系' },
  { value: '私立理系', label: '私立理系' },
  { value: '専門学校(2年)', label: '専門学校(2年)' },
  { value: '専門学校(3年)', label: '専門学校(3年)' },
  { value: '就職', label: '就職' },
];

const KID_KEYS = [
  { age: 'c1age', mid: 'c1mid', high: 'c1high', uni: 'c1uni', alone: 'c1alone' },
  { age: 'c2age', mid: 'c2mid', high: 'c2high', uni: 'c2uni', alone: 'c2alone' },
  { age: 'c3age', mid: 'c3mid', high: 'c3high', uni: 'c3uni', alone: 'c3alone' },
] as const;

// 教育費年額（万円/年）
const EDU_ANNUAL: Record<string, number> = {
  '公立中学': 52.9, '私立中学': 143.6,
  '公立高校': 51.3, '私立高校': 105.4,
  '国公立大学': 60.7, '私立文系': 93.5, '私立理系': 129.3,
  '専門学校(2年)': 100, '専門学校(3年)': 90, '就職': 0,
};
const EDU_YEARS: Record<string, number> = {
  '公立中学': 3, '私立中学': 3,
  '公立高校': 3, '私立高校': 3,
  '国公立大学': 4, '私立文系': 4, '私立理系': 4,
  '専門学校(2年)': 2, '専門学校(3年)': 3, '就職': 0,
};

export default function Lcc({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const h = data.household;
  const b = data.basic;
  const set = (patch: Partial<HouseholdExpenses>) => update({ household: { ...h, ...patch } });
  const setBasic = (patch: Partial<BI>) => update({ basic: { ...b, ...patch } });

  // LCC の電気代は「太陽光なしの現在の電気代」を採用
  //   (太陽光の節電効果・売電収入は別途キャッシュフロー上で加算される)
  const linkedElec = calc.effectiveElecBill;
  const electricNow = h.electricMonthly > 0 ? h.electricMonthly : linkedElec;

  // 光熱費 月額合計
  const utilMonthly = electricNow + h.gasMonthly + h.waterMonthly;

  // ─── 月収バナー（現役期）───
  const mainAnnual = b.income;
  const mainBonus = b.annualBonusInc;
  const mainThr = takeHomeRate(mainAnnual + mainBonus);
  const mainMonthlyTake = mainAnnual * mainThr / 12;
  const mainBonusM = mainBonus * mainThr / 12;
  const mainTotalM = mainMonthlyTake + mainBonusM;

  const spAnnual = b.spouseEnabled ? b.spouseIncome : 0;
  const spBonus = b.spouseEnabled ? b.spouseAnnualBonusInc : 0;
  const spThr = b.spouseEnabled ? takeHomeRate(spAnnual + spBonus) : 0;
  const spMonthlyTake = spAnnual * spThr / 12;
  const spBonusM = spBonus * spThr / 12;
  const spTotalM = spMonthlyTake + spBonusM;

  const householdTakeM = mainTotalM + spTotalM;

  // ─── 月支出（現役期）───
  const workSum = h.food + h.transport + h.daily + h.clothes + h.hobby + h.car + h.social + h.medical + h.other;
  // 住宅ローン月返済（1期=現役期に最も使われる金利）
  const loanMonthly = calc.monthlyPhase1 > 0 ? calc.monthlyPhase1 : calc.monthly;
  // 月支出合計（生活+光熱+ローン+他ローン+保険）
  const insSum = h.ins1 + h.ins2 + h.ins3 + h.ins4 + h.ins5 + h.ins6;
  // 貯蓄型保険 月々支払い合計（まだ満期前のもの = 「今」払っているもの）
  const siMonthlyTotal = data.savingsInsurances
    .filter(si => si.payoutYear > 0)  // 満期年が設定されているもののみ
    .reduce((sum, si) => sum + si.monthly, 0);
  const totalWorkOut = workSum + utilMonthly + loanMonthly + h.otherLoan + insSum + siMonthlyTotal;
  const workSurplus = householdTakeM - totalWorkOut;

  // ─── 住宅ローン (退職後判定) ───
  // 退職時に完済済みなら 0、まだ返済中なら 3期 月返済を採用
  const loanCompletedBeforeRetire = calc.completionAge <= b.retireAge;
  const retLoanMonthly = loanCompletedBeforeRetire ? 0 : (calc.monthlyPhase3 > 0 ? calc.monthlyPhase3 : calc.monthly);

  // ─── 年金（退職後）───
  const wY = Math.min(40, Math.max(0, b.retireAge - 22));
  const spWY = b.spouseEnabled ? Math.min(40, Math.max(0, b.spouseRetireAge - 22)) : 0;
  const pensionM = estimatePensionMonthly(b.income, wY);
  const spPensionM = b.spouseEnabled ? estimatePensionMonthly(b.spouseIncome, spWY) : 0;
  const pensionTotal = pensionM + spPensionM;

  // ─── 月支出（退職後）───
  const retSum = h.retFood + h.retUtility + h.retTransport + h.retDaily + h.retClothes + h.retHobby + h.retCar + h.retSocial + h.retMedical + h.retOther;
  const retInsSum = h.retIns1 + h.retIns2 + h.retIns3 + h.retIns4;
  const totalRetOut = retSum + retInsSum + retLoanMonthly;
  const retSurplus = pensionTotal - totalRetOut;

  // ─── 教育費（子どもごと）───
  const kidsCount = Math.min(3, Math.max(0, b.kids));
  const kidEduInfo = Array.from({ length: kidsCount }).map((_, idx) => {
    const k = KID_KEYS[idx];
    const age = b[k.age] as number;
    const mid = b[k.mid] as string;
    const high = b[k.high] as string;
    const uni = b[k.uni] as string;
    const alone = b[k.alone] as number;
    const midTotal = (EDU_ANNUAL[mid] ?? 0) * (EDU_YEARS[mid] ?? 0);
    const highTotal = (EDU_ANNUAL[high] ?? 0) * (EDU_YEARS[high] ?? 0);
    const uniTotal = (EDU_ANNUAL[uni] ?? 0) * (EDU_YEARS[uni] ?? 0);
    const aloneTotal = b.aloneMonthly * 12 * alone;
    return { idx, age, mid, high, uni, alone, midTotal, highTotal, uniTotal, aloneTotal, total: midTotal + highTotal + uniTotal + aloneTotal };
  });

  // ─── LCC 内訳（円グラフ）───
  const solarInit =
    (data.solar.enabled ? data.solar.solarCost : 0)
    + (data.solar.battEnabled ? data.solar.battCost : 0);
  const pieData = [
    { name: '💡 光熱費', value: Math.round(calc.totalUtility), color: '#E8A838' },
    { name: '🏛 固定資産税', value: Math.round(calc.totalPropTax), color: '#787774' },
    { name: '🎓 教育費', value: Math.round(calc.totalEdu), color: '#2D7DD2' },
    { name: '🔧 メンテナンス', value: Math.round(calc.totalMaint), color: '#E55B4D' },
    { name: '☀️ 太陽光初期', value: Math.round(solarInit), color: '#3DAA7B' },
  ].filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ─── 左列 ─── */}
      <div className="lg:col-span-2 space-y-4">
        {/* 光熱費 */}
        <Card title="💡 光熱費の設定（月額）">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <UtilityCard
              icon="⚡"
              label="電気代"
              value={electricNow}
              linked={h.electricMonthly === 0}
              onChange={v => set({ electricMonthly: v })}
              note={
                h.electricMonthly > 0
                  ? `✍ 手動上書き中（連動値: ${fmt(linkedElec, 1)} 万円）`
                  : `🔗 太陽光タブの「現在の電気代」を自動反映: ${fmt(linkedElec, 1)} 万円`
              }
              extraAction={h.electricMonthly > 0 ? (
                <button
                  type="button"
                  onClick={() => set({ electricMonthly: 0 })}
                  className="text-[10px] text-accent-blue hover:underline ml-2"
                >連動に戻す</button>
              ) : undefined}
            />
            <UtilityCard
              icon="🔥"
              label="ガス代"
              value={h.gasMonthly}
              onChange={v => set({ gasMonthly: v })}
              note="✍ 手動入力"
            />
            <UtilityCard
              icon="💧"
              label="水道代"
              value={h.waterMonthly}
              onChange={v => set({ waterMonthly: v })}
              note="✍ 手動入力"
            />
          </div>
          <div className="text-right text-sm mt-3">
            合計 <span className="tabular font-bold text-ink-main">{fmt(utilMonthly, 1)} 万円/月</span>
          </div>
        </Card>

        {/* 月支出（現役） */}
        <Card title="🧮 月支出の設定（現役時）">
          {/* 月収バナー */}
          <div className="bg-status-ok/10 border border-status-ok/20 rounded-[8px] p-4 mb-4">
            <div className="text-xs font-bold text-status-ok mb-2">💰 世帯月収（手取り）</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-main">世帯主（年収 {fmtMan(mainAnnual)}万 / 手取率 {(mainThr * 100).toFixed(0)}%）</span>
                <span className="tabular text-ink-main">
                  月給 {fmt(mainMonthlyTake, 1)} ＋ ボーナス {fmt(mainBonusM, 1)} ＝ <span className="font-bold">{fmt(mainTotalM, 1)}</span> 万
                </span>
              </div>
              {b.spouseEnabled && (
                <div className="flex justify-between">
                  <span className="text-ink-main">配偶者（年収 {fmtMan(spAnnual)}万 / 手取率 {(spThr * 100).toFixed(0)}%）</span>
                  <span className="tabular text-ink-main">
                    月給 {fmt(spMonthlyTake, 1)} ＋ ボーナス {fmt(spBonusM, 1)} ＝ <span className="font-bold">{fmt(spTotalM, 1)}</span> 万
                  </span>
                </div>
              )}
              <div className="border-t border-status-ok/30 pt-2 mt-1 flex justify-between font-bold">
                <span>世帯 月収合計（手取り）</span>
                <span className="tabular text-status-ok">{fmt(householdTakeM, 1)} 万円</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="🍴 食費"><NumInput value={h.food} onChange={v => set({ food: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🚌 交通通信"><NumInput value={h.transport} onChange={v => set({ transport: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🧴 日用品"><NumInput value={h.daily} onChange={v => set({ daily: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="👗 洋服"><NumInput value={h.clothes} onChange={v => set({ clothes: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🎯 趣味"><NumInput value={h.hobby} onChange={v => set({ hobby: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🚗 車関連"><NumInput value={h.car} onChange={v => set({ car: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🤝 交際費"><NumInput value={h.social} onChange={v => set({ social: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="📋 その他"><NumInput value={h.other} onChange={v => set({ other: v })} step={0.5} suffix="万円/月" /></Field>
          </div>
          <div className="text-right text-sm mt-3">
            生活費合計 <span className="tabular font-bold text-ink-main">{fmt(workSum, 1)} 万円/月</span>
          </div>

          {/* 住宅ローン（1期） — ローン計画と連動 */}
          <div className="mt-4 bg-status-danger/5 border border-status-danger/20 rounded-[10px] p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🏠</span>
                <span className="text-[12px] font-bold text-ink-main">住宅ローン（1期）</span>
                <span className="text-[10px] bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded font-bold">🔗 連動</span>
              </div>
              <div className="text-right">
                <div className="tabular font-bold text-status-danger text-base">
                  {fmt(loanMonthly, 1)} <span className="text-xs font-normal text-ink-sub">万円/月</span>
                </div>
                <div className="text-[10px] text-ink-sub">年 {fmt(loanMonthly * 12, 1)} 万円</div>
              </div>
            </div>
          </div>

          {/* 現役時 余剰/不足 */}
          <SurplusCard
            label="現役時 毎月の余剰/不足"
            income={householdTakeM}
            out={totalWorkOut}
            breakdown={[
              { label: '生活費', v: workSum },
              { label: '光熱費', v: utilMonthly },
              { label: 'ローン', v: loanMonthly },
              { label: '他ローン', v: h.otherLoan },
              { label: '保険', v: insSum },
              { label: '貯蓄型保険', v: siMonthlyTotal },
            ]}
            value={workSurplus}
          />
        </Card>

        {/* 月支出（退職後） */}
        <Card title="🪙 月支出の設定（退職後）">
          {/* 年金バナー */}
          <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-[8px] p-4 mb-4">
            <div className="text-xs font-bold text-accent-blue mb-2">🪙 退職後 年金収入</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-main">世帯主の年金</span>
                <span className="tabular font-bold text-ink-main">{fmt(pensionM, 1)} 万円/月</span>
              </div>
              {b.spouseEnabled && (
                <div className="flex justify-between">
                  <span className="text-ink-main">配偶者の年金</span>
                  <span className="tabular font-bold text-ink-main">{fmt(spPensionM, 1)} 万円/月</span>
                </div>
              )}
              <div className="border-t border-accent-blue/30 pt-2 mt-1 flex justify-between font-bold">
                <span>世帯 月収合計（年金）</span>
                <span className="tabular text-accent-blue">{fmt(pensionTotal, 1)} 万円</span>
              </div>
              <p className="text-[11px] text-ink-sub mt-2">基礎=6.5万×min(1, 勤続÷40) ＋ 厚生=年収×5.481‰×勤続年数（勤続=定年−22）</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="🍴 食費"><NumInput value={h.retFood} onChange={v => set({ retFood: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="💡 光熱費"><NumInput value={h.retUtility} onChange={v => set({ retUtility: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🚌 交通通信"><NumInput value={h.retTransport} onChange={v => set({ retTransport: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🧴 日用品"><NumInput value={h.retDaily} onChange={v => set({ retDaily: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="👗 洋服"><NumInput value={h.retClothes} onChange={v => set({ retClothes: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🎯 趣味"><NumInput value={h.retHobby} onChange={v => set({ retHobby: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🚗 車関連"><NumInput value={h.retCar} onChange={v => set({ retCar: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="🤝 交際費"><NumInput value={h.retSocial} onChange={v => set({ retSocial: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="💊 医療費"><NumInput value={h.retMedical} onChange={v => set({ retMedical: v })} step={0.5} suffix="万円/月" /></Field>
            <Field label="📋 その他"><NumInput value={h.retOther} onChange={v => set({ retOther: v })} step={0.5} suffix="万円/月" /></Field>
          </div>
          <div className="text-right text-sm mt-3">
            退職後 月支出合計 <span className="tabular font-bold text-ink-main">{fmt(totalRetOut, 1)} 万円/月</span>
          </div>

          {/* 住宅ローン（退職後・3期 or 完済） */}
          <div className={`mt-4 rounded-[10px] p-3 border ${loanCompletedBeforeRetire ? 'bg-status-ok/8 border-status-ok/30' : 'bg-status-danger/5 border-status-danger/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🏠</span>
                <span className="text-[12px] font-bold text-ink-main">住宅ローン（退職後）</span>
                <span className="text-[10px] bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded font-bold">🔗 連動</span>
              </div>
              <div className="text-right">
                {loanCompletedBeforeRetire ? (
                  <>
                    <div className="tabular font-bold text-status-ok text-base">
                      ✅ 完済
                    </div>
                    <div className="text-[10px] text-ink-sub">{calc.completionAge}歳で完済（定年前）</div>
                  </>
                ) : (
                  <>
                    <div className="tabular font-bold text-status-danger text-base">
                      {fmt(retLoanMonthly, 1)} <span className="text-xs font-normal text-ink-sub">万円/月</span>
                    </div>
                    <div className="text-[10px] text-ink-sub">3期月返済 / {calc.completionAge}歳に完済予定</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <SurplusCard
            label="退職後 毎月の余剰/不足"
            income={pensionTotal}
            out={totalRetOut}
            breakdown={[
              { label: '生活費', v: retSum },
              { label: '保険', v: retInsSum },
            ]}
            value={retSurplus}
          />
        </Card>

        {/* 教育費 */}
        {kidsCount > 0 && (
          <Card title={`🎓 教育費の設定（${kidsCount}人）`}>
            <div className="grid grid-cols-1 gap-3 mb-3">
              <Field label="一人暮らし 仕送り月額（共通）">
                <NumInput value={b.aloneMonthly} onChange={v => setBasic({ aloneMonthly: v })} step={0.1} suffix="万円/月" />
              </Field>
            </div>
            <div className="space-y-3">
              {kidEduInfo.map(k => (
                <div key={k.idx} className="bg-bg-panel rounded-[8px] p-4">
                  <div className="text-xs font-bold text-ink-sub mb-3">お子様 {k.idx + 1}</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Field label="現在年齢"><NumInput value={k.age} onChange={v => setBasic({ [KID_KEYS[k.idx].age]: v } as any)} suffix="歳" /></Field>
                    <Field label="中学">
                      <Select<string> value={k.mid} onChange={v => setBasic({ [KID_KEYS[k.idx].mid]: v } as any)} options={MID_OPTIONS} />
                    </Field>
                    <Field label="高校">
                      <Select<string> value={k.high} onChange={v => setBasic({ [KID_KEYS[k.idx].high]: v } as any)} options={HIGH_OPTIONS} />
                    </Field>
                    <Field label="大学・進路">
                      <Select<string> value={k.uni} onChange={v => setBasic({ [KID_KEYS[k.idx].uni]: v } as any)} options={UNI_OPTIONS} />
                    </Field>
                    <Field label="一人暮らし年数"><NumInput value={k.alone} onChange={v => setBasic({ [KID_KEYS[k.idx].alone]: v } as any)} suffix="年" /></Field>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs">
                    <Mini label="中学" value={fmtMan(k.midTotal)} />
                    <Mini label="高校" value={fmtMan(k.highTotal)} />
                    <Mini label="大学等" value={fmtMan(k.uniTotal)} />
                    <Mini label="仕送り" value={fmtMan(k.aloneTotal)} />
                    <Mini label="合計" value={fmtMan(k.total)} accent />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 急な出費 */}
        {/* 貯蓄型保険 */}
        <Card title="💎 貯蓄型保険（学資・養老・個人年金など）">
          <p className="text-xs text-ink-sub mb-3">
            月々の保険料は支出として計上されますが、満期年に受取金額が「収入」として balance に加算されます。<br />
            💡 <strong>受取金額は「月々の保険料 × 12 × 満期年」で自動計算</strong>されます。実際の解約返戻金（学資300万・養老式など）に合わせて手動上書きも可能。
          </p>

          {data.savingsInsurances.length === 0 && (
            <div className="text-sm text-ink-sub text-center py-3 bg-bg-panel rounded-[8px]">
              まだ登録されていません（例: 学資保険 月1.5万・18年後に300万）
            </div>
          )}

          <div className="space-y-2">
            {data.savingsInsurances.map((si, idx) => {
              const totalPaid = si.monthly * 12 * si.payoutYear;
              const diff = si.payoutAmount - totalPaid;
              return (
                <div key={si.id} className="bg-bg-panel rounded-[10px] p-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 text-center text-xs text-ink-sub tabular">{idx + 1}.</div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={si.name}
                        placeholder="例: 学資保険"
                        onChange={ev => {
                          const arr = data.savingsInsurances.map(x => x.id === si.id ? { ...x, name: ev.target.value } : x);
                          update({ savingsInsurances: arr });
                        }}
                        className="w-full px-2 py-1.5 bg-bg-card border border-line-card rounded-[6px] text-sm outline-none focus:border-accent-blue"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center bg-bg-card border border-line-card rounded-[6px]">
                        <input
                          type="number"
                          min={0}
                          value={si.monthly > 0 ? si.monthly : ''}
                          placeholder="0"
                          step={0.5}
                          onChange={ev => {
                            const v = ev.target.value === '' ? 0 : Number(ev.target.value);
                            const newMonthly = Math.max(0, v);
                            const arr = data.savingsInsurances.map(x => x.id === si.id
                              ? { ...x, monthly: newMonthly, payoutAmount: Math.round(newMonthly * 12 * x.payoutYear * 10) / 10 }
                              : x);
                            update({ savingsInsurances: arr });
                          }}
                          onKeyDown={e => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                          className="w-full px-2 py-1.5 bg-transparent outline-none tabular text-right text-sm"
                        />
                        <span className="px-1.5 text-[10px] text-ink-sub">万/月</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center bg-bg-card border border-line-card rounded-[6px]">
                        <input
                          type="number"
                          min={0}
                          value={si.payoutYear > 0 ? si.payoutYear : ''}
                          placeholder="0"
                          onChange={ev => {
                            const v = ev.target.value === '' ? 0 : Number(ev.target.value);
                            const newYear = Math.max(0, v);
                            const arr = data.savingsInsurances.map(x => x.id === si.id
                              ? { ...x, payoutYear: newYear, payoutAmount: Math.round(x.monthly * 12 * newYear * 10) / 10 }
                              : x);
                            update({ savingsInsurances: arr });
                          }}
                          onKeyDown={e => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                          className="w-full px-2 py-1.5 bg-transparent outline-none tabular text-right text-sm"
                        />
                        <span className="px-1.5 text-[10px] text-ink-sub">年後</span>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center bg-bg-card border border-line-card rounded-[6px]">
                        <input
                          type="number"
                          min={0}
                          value={si.payoutAmount > 0 ? si.payoutAmount : ''}
                          placeholder="0"
                          step={10}
                          onChange={ev => {
                            const v = ev.target.value === '' ? 0 : Number(ev.target.value);
                            const arr = data.savingsInsurances.map(x => x.id === si.id ? { ...x, payoutAmount: Math.max(0, v) } : x);
                            update({ savingsInsurances: arr });
                          }}
                          onKeyDown={e => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                          className="w-full px-2 py-1.5 bg-transparent outline-none tabular text-right text-sm"
                        />
                        <span className="px-1.5 text-[10px] text-ink-sub">万円受取</span>
                      </div>
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => update({ savingsInsurances: data.savingsInsurances.filter(x => x.id !== si.id) })}
                        className="text-status-danger hover:bg-status-danger/10 rounded px-2 py-1 text-sm"
                        title="削除"
                      >🗑</button>
                    </div>
                  </div>
                  {/* 損益サマリー */}
                  {si.monthly > 0 && si.payoutYear > 0 && (
                    <div className="text-[11px] text-ink-sub mt-2 px-1 flex flex-wrap gap-x-3">
                      <span>累計払込: <span className="tabular text-ink-main">{fmt(totalPaid, 1)}万</span></span>
                      <span>満期受取: <span className="tabular text-ink-main">{fmt(si.payoutAmount, 1)}万</span></span>
                      <span>
                        差引:
                        <span className={`tabular font-bold ml-1 ${diff >= 0 ? 'text-status-ok' : 'text-status-danger'}`}>
                          {diff >= 0 ? '+' : ''}{fmt(diff, 1)}万
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => update({
              savingsInsurances: [
                ...data.savingsInsurances,
                { id: crypto.randomUUID(), name: '', monthly: 0, payoutYear: 0, payoutAmount: 0 },
              ],
            })}
            className="mt-3 w-full bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-[8px] py-2 text-sm font-bold transition-colors"
          >＋ 貯蓄型保険を追加</button>

          {data.savingsInsurances.length > 0 && (
            <div className="mt-3 text-right text-xs space-y-0.5">
              <div>月々支払い合計: <span className="tabular font-bold text-status-danger">{fmt(siMonthlyTotal, 1)} 万円/月</span></div>
              <div>満期受取合計: <span className="tabular font-bold text-status-ok">
                {fmt(data.savingsInsurances.reduce((s, e) => s + e.payoutAmount, 0), 0)} 万円
              </span></div>
            </div>
          )}
        </Card>

        <Card title="💸 急な出費（フリー入力）">
          <p className="text-xs text-ink-sub mb-3">
            車買い替え・家電一新・旅行・親の介護費など、定期的に発生する大きな支出を <strong>「○年ごと」</strong> の周期で登録できます。CF・残高に自動反映。
          </p>

          {data.suddenExpenses.length === 0 && (
            <div className="text-sm text-ink-sub text-center py-3 bg-bg-panel rounded-[8px]">
              まだ登録されていません（例: 車買い替え 8年ごと 200万）
            </div>
          )}

          <div className="space-y-2">
            {data.suddenExpenses.map((e, idx) => (
              <div key={e.id} className="grid grid-cols-12 gap-2 items-center bg-bg-panel rounded-[8px] p-2">
                <div className="col-span-1 text-center text-xs text-ink-sub tabular">{idx + 1}.</div>
                <div className="col-span-5">
                  <input
                    type="text"
                    value={e.name}
                    onChange={ev => {
                      const arr = data.suddenExpenses.map(x => x.id === e.id ? { ...x, name: ev.target.value } : x);
                      update({ suddenExpenses: arr });
                    }}
                    placeholder="例: 車買い替え"
                    className="w-full px-2 py-1.5 bg-bg-card border border-line-card rounded-[6px] text-sm outline-none focus:border-accent-blue"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center bg-bg-card border border-line-card rounded-[6px]">
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(e.cycleYears) && e.cycleYears > 0 ? e.cycleYears : ''}
                      placeholder="0"
                      onChange={ev => {
                        const v = ev.target.value === '' ? 0 : Number(ev.target.value);
                        const arr = data.suddenExpenses.map(x => x.id === e.id ? { ...x, cycleYears: Math.max(0, v) } : x);
                        update({ suddenExpenses: arr });
                      }}
                      onKeyDown={ev => { if (ev.key === '-' || ev.key === 'e' || ev.key === 'E') ev.preventDefault(); }}
                      className="w-full px-2 py-1.5 bg-transparent outline-none tabular text-right text-sm"
                    />
                    <span className="px-1.5 text-[10px] text-ink-sub">年ごと</span>
                  </div>
                </div>
                <div className="col-span-3">
                  <div className="flex items-center bg-bg-card border border-line-card rounded-[6px]">
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(e.amount) && e.amount > 0 ? e.amount : ''}
                      placeholder="0"
                      onChange={ev => {
                        const v = ev.target.value === '' ? 0 : Number(ev.target.value);
                        const arr = data.suddenExpenses.map(x => x.id === e.id ? { ...x, amount: Math.max(0, v) } : x);
                        update({ suddenExpenses: arr });
                      }}
                      onKeyDown={ev => { if (ev.key === '-' || ev.key === 'e' || ev.key === 'E') ev.preventDefault(); }}
                      step={10}
                      className="w-full px-2 py-1.5 bg-transparent outline-none tabular text-right text-sm"
                    />
                    <span className="px-1.5 text-[10px] text-ink-sub">万円</span>
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => update({ suddenExpenses: data.suddenExpenses.filter(x => x.id !== e.id) })}
                    className="text-status-danger hover:bg-status-danger/10 rounded px-2 py-1 text-sm"
                    title="削除"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => update({
              suddenExpenses: [
                ...data.suddenExpenses,
                { id: crypto.randomUUID(), name: '', amount: 0, cycleYears: 0 },
              ],
            })}
            className="mt-3 w-full bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-[8px] py-2 text-sm font-bold transition-colors"
          >＋ 項目を追加</button>

          {data.suddenExpenses.length > 0 && (
            <div className="mt-3 text-right text-xs space-y-0.5">
              <div>
                1回あたり合計 <span className="tabular font-bold text-status-danger">
                  {fmt(data.suddenExpenses.reduce((s, e) => s + e.amount, 0), 0)} 万円
                </span>
                <span className="text-ink-sub ml-2">（{data.suddenExpenses.length} 件）</span>
              </div>
              <div className="text-ink-sub">
                {data.simYears}年間で発生する合計 <span className="tabular font-bold text-status-danger">
                  {fmt(
                    data.suddenExpenses.reduce((s, e) =>
                      s + calcSuddenExpenseTotal(data.simYears, e)
                    , 0),
                    0
                  )} 万円
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ─── 右列 ─── */}
      <div className="space-y-4">
        {/* LCC合計 */}
        <Card title={`📦 LCC 合計（${data.simYears}年）`}>
          <div className="bg-status-danger/10 border border-status-danger/20 rounded-[8px] p-5 text-center">
            <div className="text-sm text-ink-sub">{data.simYears}年合計</div>
            <div className="text-4xl font-bold tabular text-status-danger mt-2">
              {fmtMan(calc.lccGrand)}<span className="text-base font-normal text-ink-sub ml-1">万円</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <div className="text-ink-sub">月平均</div>
                <div className="tabular font-bold text-ink-main">{fmtMan(calc.lccGrand / data.simYears / 12)} 万円</div>
              </div>
              <div>
                <div className="text-ink-sub">年平均</div>
                <div className="tabular font-bold text-ink-main">{fmtMan(calc.lccGrand / data.simYears)} 万円</div>
              </div>
            </div>
          </div>
          {calc.lifeLeaveIncomeLoss > 0 && (
            <div className="mt-3 bg-status-warn/10 border border-status-warn/30 rounded-[8px] p-4">
              <div className="text-xs font-bold text-status-warn mb-1">産休・育休による収入減</div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-ink-sub">LCCとは別に、世帯収入が下がる影響</span>
                <span className="tabular font-bold text-status-danger">-{fmtMan(calc.lifeLeaveIncomeLoss)} 万円</span>
              </div>
              <div className="border-t border-status-warn/30 mt-2 pt-2 flex justify-between items-baseline text-sm">
                <span className="font-bold text-ink-main">LCC＋収入減インパクト</span>
                <span className="tabular font-bold text-status-danger">{fmtMan(calc.lccGrand + calc.lifeLeaveIncomeLoss)} 万円</span>
              </div>
            </div>
          )}
        </Card>

        {/* LCC 内訳 */}
        <Card title="📊 LCC 内訳">
          <div className="h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v.toLocaleString()}万円`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <Row label="💡 光熱費" value={fmtMan(calc.totalUtility)} />
            <Row label="🏛 固定資産税" value={fmtMan(calc.totalPropTax)} />
            <Row label="☀️ 太陽光初期" value={fmtMan(solarInit)} />
            <Row label="🔧 メンテナンス" value={fmtMan(calc.totalMaint)} />
            <Row label="🎓 教育費" value={fmtMan(calc.totalEdu)} />
            {calc.lifeLeaveIncomeLoss > 0 && (
              <Row label="産休・育休 収入減" value={`-${fmtMan(calc.lifeLeaveIncomeLoss)}`} negative />
            )}
            <div className="border-t border-line-table my-1" />
            <Row label="合計" value={fmtMan(calc.lccGrand)} bold />
          </div>
        </Card>

        {/* 現在の家計状況 */}
        <Card title="💵 現在の家計状況">
          <div className="space-y-1 text-sm">
            <Row label="世帯主 月給手取り" value={fmt(mainMonthlyTake, 1)} />
            <Row label="世帯主 ボーナス月割" value={fmt(mainBonusM, 1)} />
            {b.spouseEnabled && (
              <>
                <Row label="配偶者 月給手取り" value={fmt(spMonthlyTake, 1)} />
                <Row label="配偶者 ボーナス月割" value={fmt(spBonusM, 1)} />
              </>
            )}
            <div className="border-t border-line-table my-1" />
            <Row label="世帯 月収合計" value={fmt(householdTakeM, 1)} bold />
            <Row label="月支出合計" value={fmt(totalWorkOut, 1)} negative />
            <div className="border-t-2 border-line-card my-1" />
            <div className={`rounded-[8px] p-2 ${workSurplus >= 0 ? 'bg-status-ok/10 text-status-ok' : 'bg-status-danger/10 text-status-danger'}`}>
              <div className="flex justify-between font-bold">
                <span>{workSurplus >= 0 ? '✅' : '🔴'} 現役時 毎月の{workSurplus >= 0 ? '余剰' : '不足'}</span>
                <span className="tabular">{workSurplus >= 0 ? '+' : ''}{fmt(workSurplus, 1)} 万</span>
              </div>
            </div>
            <div className="border-t border-line-table my-2" />
            <div className="text-xs font-bold text-ink-sub">退職後</div>
            <Row label="年金収入（月）" value={fmt(pensionTotal, 1)} />
            <Row label="退職後 月支出" value={fmt(totalRetOut, 1)} negative />
            <div className={`rounded-[8px] p-2 mt-1 ${retSurplus >= 0 ? 'bg-status-ok/10 text-status-ok' : 'bg-status-danger/10 text-status-danger'}`}>
              <div className="flex justify-between font-bold">
                <span>{retSurplus >= 0 ? '✅' : '🔴'} 退職後 毎月の{retSurplus >= 0 ? '余剰' : '不足'}</span>
                <span className="tabular">{retSurplus >= 0 ? '+' : ''}{fmt(retSurplus, 1)} 万</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="保険料（参考設定）">
          <p className="text-xs text-ink-sub mb-3">月額（現役・退職後それぞれ）。月支出に加算されます。</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="現役 保1"><NumInput value={h.ins1} onChange={v => set({ ins1: v })} step={0.1} /></Field>
            <Field label="現役 保2"><NumInput value={h.ins2} onChange={v => set({ ins2: v })} step={0.1} /></Field>
            <Field label="現役 保3"><NumInput value={h.ins3} onChange={v => set({ ins3: v })} step={0.1} /></Field>
            <Field label="現役 保4"><NumInput value={h.ins4} onChange={v => set({ ins4: v })} step={0.1} /></Field>
            <Field label="現役 保5"><NumInput value={h.ins5} onChange={v => set({ ins5: v })} step={0.1} /></Field>
            <Field label="現役 保6"><NumInput value={h.ins6} onChange={v => set({ ins6: v })} step={0.1} /></Field>
            <Field label="退職後 保1"><NumInput value={h.retIns1} onChange={v => set({ retIns1: v })} step={0.1} /></Field>
            <Field label="退職後 保2"><NumInput value={h.retIns2} onChange={v => set({ retIns2: v })} step={0.1} /></Field>
            <Field label="退職後 保3"><NumInput value={h.retIns3} onChange={v => set({ retIns3: v })} step={0.1} /></Field>
            <Field label="退職後 保4"><NumInput value={h.retIns4} onChange={v => set({ retIns4: v })} step={0.1} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <StatBox label="現役 保険合計" value={fmt(insSum, 1)} suffix="万円/月" tone="normal" />
            <StatBox label="退職後 保険合計" value={fmt(retInsSum, 1)} suffix="万円/月" tone="normal" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function UtilityCard({ icon, label, value, linked, onChange, note, extraAction }: { icon: string; label: string; value: number; linked?: boolean; onChange: (v: number) => void; note?: string; extraAction?: React.ReactNode }) {
  return (
    <div className={`bg-bg-panel rounded-[8px] p-4 ${linked ? 'border-2 border-accent-blue/30' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold text-ink-main">{icon} {label}</div>
        {linked && <span className="text-[10px] bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded font-bold">🔗 連動</span>}
      </div>
      <NumInput value={value} onChange={onChange} step={0.1} suffix="万円/月" />
      {note && (
        <div className={`text-[11px] mt-2 leading-relaxed ${linked ? 'text-accent-blue' : 'text-ink-sub'}`}>
          {note}
          {extraAction}
        </div>
      )}
    </div>
  );
}

function SurplusCard({ label, income, out, breakdown, value }: { label: string; income: number; out: number; breakdown: { label: string; v: number }[]; value: number }) {
  const positive = value >= 0;
  return (
    <div className={`rounded-[8px] p-4 mt-4 border ${positive ? 'bg-status-ok/10 border-status-ok/30' : 'bg-status-danger/10 border-status-danger/30'}`}>
      <div className="text-xs font-bold text-ink-sub mb-2">{label}</div>
      <div className="text-sm">
        <span className="tabular text-ink-main">収入 {fmt(income, 1)} 万</span>
        <span className="text-ink-sub mx-2">−</span>
        <span className="tabular text-ink-main">支出 {fmt(out, 1)} 万</span>
        <span className="text-ink-sub mx-2">＝</span>
        <span className={`tabular font-bold text-lg ${positive ? 'text-status-ok' : 'text-status-danger'}`}>
          {positive ? '+' : ''}{fmt(value, 1)} 万
        </span>
      </div>
      <div className="text-[11px] text-ink-sub mt-2">支出内訳: {breakdown.map(b => `${b.label} ${fmt(b.v, 1)}`).join(' / ')}</div>
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`${bold ? 'text-ink-main font-semibold' : 'text-ink-sub'}`}>{label}</span>
      <span className={`tabular ${bold ? 'text-ink-main font-bold' : negative ? 'text-status-danger' : 'text-ink-main'}`}>
        {value} <span className="text-xs text-ink-sub font-normal">万円</span>
      </span>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-bg-card rounded-[6px] px-2 py-1.5">
      <div className="text-[10px] text-ink-label">{label}</div>
      <div className={`tabular font-bold ${accent ? 'text-accent-blue' : 'text-ink-main'}`}>{value} <span className="text-[10px] font-normal text-ink-sub">万</span></div>
    </div>
  );
}
