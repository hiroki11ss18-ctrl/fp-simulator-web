import { Card, Field, NumInput, Section, Select, TextInput, Toggle } from '../ui';
import type { SimData, BasicInfo as BI } from '../../types';
import {
  CHILDCARE_LEAVE_AFTER_RATE,
  CHILDCARE_LEAVE_FIRST_RATE,
  MATERNITY_LEAVE_RATE,
  calcSpouseLeaveMonthlyBreakdown,
  calcSpouseLeaveYear,
  estimatePensionMonthly,
  lookupManualSalary,
  projectSalary,
} from '../../hooks/useCalculations';
import { fmt, fmtMan } from '../../lib/format';

const SALARY_AGES = [30, 35, 40, 45, 50, 55, 60, 65] as const;

export default function BasicInfo({ data, update }: { data: SimData; update: (p: Partial<SimData>) => void }) {
  const b = data.basic;
  const set = (patch: Partial<BI>) => update({ basic: { ...b, ...patch } });

  // 世帯年収・手取り
  const mainGross = b.age >= b.retireAge ? 0 : (b.salaryAuto ? b.income : lookupManualSalary(b.salaryManual, b.age)) + b.annualBonusInc;
  const spouseGross = !b.spouseEnabled || b.spouseAge >= b.spouseRetireAge ? 0 : (b.salSpouseAuto ? b.spouseIncome : lookupManualSalary(b.spouseSalaryManual, b.spouseAge)) + b.spouseAnnualBonusInc;
  const householdIncome = mainGross + spouseGross;
  const mainTh = b.takeHomePct / 100;
  const spTh = b.spouseEnabled ? b.spouseTakeHomePct / 100 : 0;
  const mainTake = mainGross * mainTh;
  const spTake = spouseGross > 0 ? calcSpouseLeaveYear(b, 0, spouseGross - b.spouseAnnualBonusInc, b.spouseAnnualBonusInc).income : 0;
  const householdTake = mainTake + spTake;
  const householdMonthly = householdTake / 12;

  // 年金推計
  const wY = Math.min(40, Math.max(0, b.retireAge - 22));
  const spWY = b.spouseEnabled ? Math.min(40, Math.max(0, b.spouseRetireAge - 22)) : 0;
  const pensionM = b.pensionMonthly ?? estimatePensionMonthly(b.income, wY) * 0.9;
  const spPensionM = b.spouseEnabled ? b.spousePensionMonthly ?? estimatePensionMonthly(b.spouseIncome, spWY) * 0.9 : 0;

  // 給与推移テーブル
  const projectionYears = [0, 5, 10, 15, 20, 25, 30, 35].filter(y => b.age + y <= b.retireAge + 5);

  const projection = projectionYears.map(y => {
    const age = b.age + y;
    const spAge = b.spouseAge + y;
    const isRetired = age >= b.retireAge;
    const spRetired = b.spouseEnabled ? spAge >= b.spouseRetireAge : true;
    const mainInc = isRetired ? 0 : (
      b.salaryAuto
        ? projectSalary(b.income, b.age, age, b.incomeGrowth)
        : lookupManualSalary(b.salaryManual, age)
    );
    const spInc = (b.spouseEnabled && !spRetired) ? (
      b.salSpouseAuto
        ? projectSalary(b.spouseIncome, b.spouseAge, spAge, b.spouseGrowth)
        : lookupManualSalary(b.spouseSalaryManual, spAge)
    ) : 0;
    return { y, age, spAge, isRetired, spRetired, mainInc, spInc, total: mainInc + spInc };
  });

  const leaveImpactRows = Array.from({ length: data.simYears }).map((_, y) => {
    const spAge = b.spouseAge + y;
    if (!b.spouseEnabled || spAge >= b.spouseRetireAge) {
      return { y, age: b.age + y, loss: 0, leaveMonths: 0, returnedMonths: 0 };
    }
    const spInc = b.salSpouseAuto
      ? projectSalary(b.spouseIncome, b.spouseAge, spAge, b.spouseGrowth)
      : lookupManualSalary(b.spouseSalaryManual, spAge);
    const leave = calcSpouseLeaveYear(b, y, spInc, b.spouseAnnualBonusInc);
    return { y, age: b.age + y, ...leave };
  }).filter(r => r.loss > 0 || r.leaveMonths > 0 || r.returnedMonths > 0);
  const leaveLossTotal = leaveImpactRows.reduce((sum, r) => sum + r.loss, 0);
  const maternityMonths = Math.max(0, Math.round(b.spouseMaternityMonths));
  const childcareMonths = Math.max(0, Math.round(b.spouseLeaveMonths - b.spouseMaternityMonths));
  const spouseAgeAtLeave = b.spouseAge + Math.max(0, Math.round(b.spouseLeaveStartYear));
  const spouseIncomeAtLeave = b.salSpouseAuto
    ? projectSalary(b.spouseIncome, b.spouseAge, spouseAgeAtLeave, b.spouseGrowth)
    : lookupManualSalary(b.spouseSalaryManual, spouseAgeAtLeave);
  const leaveMonthly = calcSpouseLeaveMonthlyBreakdown(b, spouseIncomeAtLeave, b.spouseAnnualBonusInc);

  return (
    <div className="space-y-4">
      {/* 顧客情報 */}
      <Card title="顧客情報">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="顧客名"><TextInput value={b.customerName} onChange={v => set({ customerName: v })} placeholder="山田 太郎" /></Field>
          <Field label="担当者名"><TextInput value={b.staffName} onChange={v => set({ staffName: v })} placeholder="営業 太郎" /></Field>
          <Field label="作成日">
            <input type="date" value={b.date} onChange={e => set({ date: e.target.value })}
              className="w-full px-3 py-2 bg-bg-card border border-line-card rounded-[8px] outline-none focus:border-accent-blue text-ink-main" />
          </Field>
        </div>
      </Card>

      {/* 世帯主・配偶者 2列 */}
      <section className="plan-section">
        <h2>年金・生活防衛資金</h2>
        <div className="form-grid">
          <Field label="世帯主の手取り年金" hint="月額。0円も指定可能。初期値は簡易推計。">
            <NumInput value={pensionM} onChange={v => set({ pensionMonthly: v })} suffix="万円/月" step={0.1} />
            <button type="button" className="text-xs text-accent-blue mt-1" onClick={() => set({ pensionMonthly: null })}>簡易推計に戻す</button>
          </Field>
          {b.spouseEnabled && <Field label="配偶者の手取り年金">
            <NumInput value={spPensionM} onChange={v => set({ spousePensionMonthly: v })} suffix="万円/月" step={0.1} />
            <button type="button" className="text-xs text-accent-blue mt-1" onClick={() => set({ spousePensionMonthly: null })}>簡易推計に戻す</button>
          </Field>}
          <Field label="生活防衛資金の目標"><NumInput value={b.emergencyFundMonths} onChange={v => set({ emergencyFundMonths: v })} suffix="か月分" step={1} max={36} /></Field>
        </div>
        <p className="plan-note">年金・退職金は税金や社会保険料を差し引いた受取額。簡易年金は現在年収・22歳就業の仮定による概算額の90%です。在職年金調整は自動計算しません。ねんきん定期便等を優先してください。</p>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 世帯主 */}
        <Card title="🧑 世帯主">
          <div className="grid grid-cols-2 gap-4">
            <Field label="年収（額面・賞与を除く）"><NumInput value={b.income} onChange={v => set({ income: v })} suffix="万円" /></Field>
            <Field label="年間ボーナス"><NumInput value={b.annualBonusInc} onChange={v => set({ annualBonusInc: v })} suffix="万円" /></Field>
            <Field label="現在年齢"><NumInput value={b.age} onChange={v => set({ age: v })} suffix="歳" /></Field>
            <Field label="定年年齢"><NumInput value={b.retireAge} onChange={v => set({ retireAge: v })} suffix="歳" /></Field>
            <Field label="定年退職金"><NumInput value={b.retireBonus} onChange={v => set({ retireBonus: v })} suffix="万円" /></Field>
            <Field label="現在の貯蓄額"><NumInput value={b.savings} onChange={v => set({ savings: v })} suffix="万円" /></Field>
            <Field label="手取り率" hint="給与・賞与から税金と社会保険料を引いた割合"><NumInput value={b.takeHomePct} onChange={v => set({ takeHomePct: v })} suffix="%" step={1} max={100} /></Field>
          </div>
          <div className="h-4" />
          <SalaryModeBlock
            label="昇給モード"
            auto={b.salaryAuto}
            onAutoChange={v => set({ salaryAuto: v })}
            growth={b.incomeGrowth}
            onGrowthChange={v => set({ incomeGrowth: v })}
            manual={b.salaryManual}
            onManualChange={arr => set({ salaryManual: arr })}
          />
        </Card>

        {/* 配偶者 */}
        <Card title="💑 配偶者" right={
          <Toggle checked={b.spouseEnabled} onChange={v => set({ spouseEnabled: v, loanBorrowType: v ? b.loanBorrowType : 'single' })} label={b.spouseEnabled ? 'あり' : 'なし'} />
        }>
          {b.spouseEnabled ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="年収（額面・賞与を除く）"><NumInput value={b.spouseIncome} onChange={v => set({ spouseIncome: v })} suffix="万円" /></Field>
                <Field label="年間ボーナス"><NumInput value={b.spouseAnnualBonusInc} onChange={v => set({ spouseAnnualBonusInc: v })} suffix="万円" /></Field>
                <Field label="現在年齢"><NumInput value={b.spouseAge} onChange={v => set({ spouseAge: v })} suffix="歳" /></Field>
                <Field label="定年年齢"><NumInput value={b.spouseRetireAge} onChange={v => set({ spouseRetireAge: v })} suffix="歳" /></Field>
                <Field label="定年退職金"><NumInput value={b.spouseRetireBonus} onChange={v => set({ spouseRetireBonus: v })} suffix="万円" /></Field>
                <Field label="現在の貯蓄額"><NumInput value={b.spouseSavings ?? 0} onChange={v => set({ spouseSavings: v })} suffix="万円" /></Field>
                <Field label="手取り率"><NumInput value={b.spouseTakeHomePct} onChange={v => set({ spouseTakeHomePct: v })} suffix="%" step={1} max={100} /></Field>
              </div>
              <div className="h-4" />
              <SalaryModeBlock
                label="昇給モード"
                auto={b.salSpouseAuto}
                onAutoChange={v => set({ salSpouseAuto: v })}
                growth={b.spouseGrowth}
                onGrowthChange={v => set({ spouseGrowth: v })}
                manual={b.spouseSalaryManual}
                onManualChange={arr => set({ spouseSalaryManual: arr })}
              />
              <div className="h-4" />
              <Section title="産休・育休シミュレーション">
                <div className="flex items-center gap-3 mt-2 mb-3">
                  <Toggle checked={b.spouseLeaveEnabled} onChange={v => set({ spouseLeaveEnabled: v })} label={b.spouseLeaveEnabled ? '反映する' : '反映しない'} />
                  <span className="text-xs text-ink-sub">配偶者収入を一時的に下げて、資産残高に反映します。</span>
                </div>
                {b.spouseLeaveEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="開始時期" hint="例: 1年後に産休開始">
                        <NumInput value={b.spouseLeaveStartYear} onChange={v => set({ spouseLeaveStartYear: v })} suffix="年後" step={1} />
                      </Field>
                      <Field label="休業合計">
                        <div className="px-3 py-2 bg-bg-panel rounded-[8px] tabular text-right text-ink-main">
                          {fmtMan(maternityMonths + childcareMonths)} <span className="text-xs text-ink-sub font-normal">か月</span>
                        </div>
                      </Field>
                      <Field label="産休期間" hint="標準は約98日≒3か月">
                        <NumInput
                          value={maternityMonths}
                          onChange={v => set({
                            spouseMaternityMonths: v,
                            spouseLeaveMonths: Math.max(v, v + childcareMonths),
                          })}
                          suffix="か月"
                          step={1}
                        />
                      </Field>
                      <Field label="育休期間" hint="例: 1年なら12か月">
                        <NumInput
                          value={childcareMonths}
                          onChange={v => set({ spouseLeaveMonths: maternityMonths + v })}
                          suffix="か月"
                          step={1}
                        />
                      </Field>
                      <Field label="復帰後収入率" hint="時短勤務なら80%など">
                        <NumInput value={b.spouseReturnIncomeRate} onChange={v => set({ spouseReturnIncomeRate: v })} suffix="%" step={5} max={100} />
                      </Field>
                    </div>
                    <div className="mt-3 bg-status-warn/8 border border-status-warn/30 rounded-[8px] p-3 text-xs text-ink-sub leading-relaxed">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <div className="font-bold text-status-warn">月額シミュレーション</div>
                        <div className="tabular">
                          通常時 {fmt(leaveMonthly.baselineMonthly, 1)}万円/月
                          <span className="text-ink-sub">（休業開始時の配偶者年収 {fmtMan(spouseIncomeAtLeave + b.spouseAnnualBonusInc)}万円ベース）</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-[8px] border border-line-table bg-bg-card">
                        <table className="min-w-full text-[11px]">
                          <thead className="bg-bg-panel text-ink-label">
                            <tr>
                              <th className="px-2 py-2 text-left">期間</th>
                              <th className="px-2 py-2 text-right">月数</th>
                              <th className="px-2 py-2 text-right">給付率</th>
                              <th className="px-2 py-2 text-right">月々もらえる目安</th>
                              <th className="px-2 py-2 text-right">通常よりマイナス</th>
                              <th className="px-2 py-2 text-right">期間合計マイナス</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leaveMonthly.rows.map(row => (
                              <tr key={row.label} className="border-t border-line-table">
                                <td className="px-2 py-2 text-ink-main whitespace-nowrap">
                                  {row.label}
                                  <div className="text-[10px] text-ink-sub">{row.startMonth}〜{row.endMonth}か月目</div>
                                </td>
                                <td className="px-2 py-2 text-right tabular">{row.months}か月</td>
                                <td className="px-2 py-2 text-right tabular">{fmt(row.rate * 100, 0)}%</td>
                                <td className="px-2 py-2 text-right tabular font-bold text-ink-main">{fmt(row.monthlyIncome, 1)}万円/月</td>
                                <td className="px-2 py-2 text-right tabular text-status-danger">-{fmt(row.monthlyLoss, 1)}万円/月</td>
                                <td className="px-2 py-2 text-right tabular text-status-danger font-bold">-{fmt(row.totalLoss, 1)}万円</td>
                              </tr>
                            ))}
                            {leaveMonthly.rows.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-2 py-3 text-center text-ink-sub">産休・育休期間を入力すると月額が表示されます。</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {leaveMonthly.returnMonthlyLoss > 0 && (
                        <div className="mt-2 flex justify-between gap-3 rounded-[8px] bg-bg-card border border-line-table px-3 py-2">
                          <span>復帰後の時短勤務など: 収入率 {fmt(leaveMonthly.returnRate * 100, 0)}%</span>
                          <span className="tabular text-status-danger font-bold">
                            月々 {fmt(leaveMonthly.returnMonthlyIncome, 1)}万円 / 通常より -{fmt(leaveMonthly.returnMonthlyLoss, 1)}万円
                          </span>
                        </div>
                      )}
                      <div className="mt-2">
                        産休 {fmt(MATERNITY_LEAVE_RATE * 100, 0)}% ／ 育休開始6か月 {fmt(CHILDCARE_LEAVE_FIRST_RATE * 100, 0)}% ／ それ以降 {fmt(CHILDCARE_LEAVE_AFTER_RATE * 100, 0)}% で概算。
                        給付は非課税・社会保険料免除の影響があるため、ここでは商談用の目安として見ます。
                      </div>
                      <div className="mt-2 font-bold text-status-warn">
                        {data.simYears}年間の収入減: <span className="tabular">{fmt(leaveLossTotal, 1)}万円</span>
                      </div>
                      {leaveImpactRows.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {leaveImpactRows.slice(0, 4).map(r => (
                            <div key={r.y} className="flex justify-between gap-3">
                              <span>{r.y}年後（{r.age}歳）: 休業 {r.leaveMonths}か月 / 復帰後調整 {r.returnedMonths}か月</span>
                              <span className="tabular text-status-danger">-{fmt(r.loss, 1)}万円</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Section>
            </>
          ) : (
            <div className="text-sm text-ink-sub">配偶者の収支は計算に含まれません。</div>
          )}
        </Card>
      </div>

      {/* 共通項目＋サマリー */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 共通設定 */}
        <Card title="🏠 共通設定" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SettingTile icon="01" label="子どもの人数" accent="green">
              <Select<number> value={b.kids} onChange={v => set({ kids: v })}
                options={[
                  { value: 0, label: '0人' },
                  { value: 1, label: '1人' },
                  { value: 2, label: '2人' },
                  { value: 3, label: '3人' },
                ]} />
            </SettingTile>
            <SettingTile icon="02" label="年金開始年齢" accent="orange">
              <NumInput value={b.pensionStartAge} onChange={v => set({ pensionStartAge: v })} suffix="歳" />
            </SettingTile>
            <SettingTile icon="03" label="ローン形態" accent="purple">
              <div className="flex rounded-[8px] border border-line-card overflow-hidden bg-bg-card">
                <button
                  type="button"
                  onClick={() => set({ loanBorrowType: 'single' })}
                  className={`px-3 py-2.5 text-sm flex-1 font-medium transition-colors ${b.loanBorrowType === 'single' ? 'bg-accent-blue text-white' : 'text-ink-main hover:bg-bg-panel'}`}
                >単独</button>
                <button
                  type="button"
                  onClick={() => set({ loanBorrowType: 'pair' })}
                  disabled={!b.spouseEnabled}
                  className={`px-3 py-2.5 text-sm flex-1 font-medium transition-colors ${b.loanBorrowType === 'pair' ? 'bg-accent-blue text-white' : 'text-ink-main hover:bg-bg-panel'} ${!b.spouseEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={!b.spouseEnabled ? '配偶者がいない場合は選択できません' : undefined}
                >ペアローン</button>
              </div>
            </SettingTile>
          </div>
        </Card>

        {/* サマリー */}
        <Card title="📊 サマリー">
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-accent-blue/15 to-accent-blue/5 border border-accent-blue/20 rounded-[10px] p-4">
              <div className="text-[11px] text-ink-label">世帯年収（額面）</div>
              <div className="text-2xl font-bold tabular text-accent-blue mt-0.5">
                {fmtMan(householdIncome)} <span className="text-sm font-normal text-ink-sub">万円</span>
              </div>
              <div className="text-[11px] text-ink-sub mt-1">
                月収（手取り）<span className="tabular font-semibold text-ink-main ml-1">{fmtMan(householdMonthly)} 万円/月</span>
              </div>
            </div>

            {/* 世帯貯蓄合計 */}
            <div className="bg-gradient-to-br from-status-ok/15 to-status-ok/5 border border-status-ok/20 rounded-[10px] p-4">
              <div className="text-[11px] text-ink-label">💰 世帯貯蓄合計</div>
              <div className="text-2xl font-bold tabular text-status-ok mt-0.5">
                {fmtMan(b.savings + (b.spouseEnabled ? b.spouseSavings : 0))} <span className="text-sm font-normal text-ink-sub">万円</span>
              </div>
              <div className="text-[11px] text-ink-sub mt-1">
                世帯主 <span className="tabular font-semibold text-ink-main">{fmtMan(b.savings)}</span>万
                {b.spouseEnabled && (
                  <> ＋ 配偶者 <span className="tabular font-semibold text-ink-main">{fmtMan(b.spouseSavings ?? 0)}</span>万</>
                )}
              </div>
            </div>

            <div className="bg-bg-panel rounded-[10px] p-3">
              <div className="text-[11px] text-ink-label">家族構成</div>
              <div className="text-base font-bold text-ink-main mt-0.5 flex items-center gap-1">
                <span>{b.spouseEnabled ? '👫 夫婦' : '🧑 単身'}</span>
                {b.kids > 0 && <span className="text-ink-sub text-sm">＋ 👶×{b.kids}</span>}
              </div>
            </div>

            <div className="bg-bg-panel rounded-[10px] p-3 text-xs">
              <div className="text-ink-label mb-2 font-medium">📋 詳細</div>
              <div className="space-y-1">
                <KV label="世帯主 手取率" value={`${(mainTh * 100).toFixed(0)}%`} />
                {b.spouseEnabled && <KV label="配偶者 手取率" value={`${(spTh * 100).toFixed(0)}%`} />}
                <KV label="世帯主 年金/月" value={`${fmtMan(pensionM)} 万円`} />
                {b.spouseEnabled && <KV label="配偶者 年金/月" value={`${fmtMan(spPensionM)} 万円`} />}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 給与推移表 */}
      <Card title="📈 給与推移（5年ごと）">
        <Section title={
          b.salaryAuto
            ? `自動: 昇給率 ${b.incomeGrowth}%/年・仮定カーブ（〜50ピーク / 55-59 −3%/年 / 60再雇用 ×0.65 / 61〜 −1%/年）`
            : '手動: 各5年ごとの年収を直接入力'
        }>
          <div className="overflow-x-auto mt-3 rounded-[10px] border border-line-card">
            <table className="min-w-full text-sm tabular">
              <thead>
                {/* グループヘッダー */}
                <tr className="text-xs">
                  <th rowSpan={2} className="py-3 px-5 text-left text-ink-label bg-bg-panel border-b border-line-card whitespace-nowrap">経過</th>
                  <th colSpan={2} className="py-2 px-5 text-center font-bold text-accent-blue bg-accent-blue/8 border-b border-accent-blue/30">
                    🧑 世帯主
                  </th>
                  <th colSpan={2} className="py-2 px-5 text-center font-bold text-status-warn bg-status-warn/8 border-b border-status-warn/30 border-l-2 border-l-line-card">
                    💑 配偶者
                  </th>
                  <th rowSpan={2} className="py-3 px-5 text-right text-status-ok bg-status-ok/8 border-b border-line-card border-l-2 border-l-line-card whitespace-nowrap">
                    💰 世帯合計
                  </th>
                </tr>
                {/* サブヘッダー */}
                <tr className="text-[11px] text-ink-label">
                  <th className="py-2.5 px-5 text-left bg-accent-blue/4 border-b border-line-card whitespace-nowrap">年齢</th>
                  <th className="py-2.5 px-5 text-right bg-accent-blue/4 border-b border-line-card whitespace-nowrap">年収</th>
                  <th className="py-2.5 px-5 text-left bg-status-warn/4 border-b border-line-card border-l-2 border-l-line-card whitespace-nowrap">年齢</th>
                  <th className="py-2.5 px-5 text-right bg-status-warn/4 border-b border-line-card whitespace-nowrap">年収</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((r, idx) => (
                  <tr
                    key={r.y}
                    className={`border-b border-line-table last:border-b-0 hover:bg-bg-panel/40 transition-colors ${idx % 2 === 1 ? 'bg-bg-panel/20' : ''}`}
                  >
                    <td className="py-3 px-5 text-ink-sub whitespace-nowrap">
                      <span className="tabular font-medium">{r.y}</span>
                      <span className="text-xs text-ink-sub ml-0.5">年目</span>
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap">
                      <span className="tabular font-medium text-ink-main">{r.age}</span>
                      <span className="text-xs text-ink-sub ml-0.5">歳</span>
                      {r.isRetired && <span className="text-ink-sub text-[10px] ml-1.5">(退職後)</span>}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {r.isRetired
                        ? <span className="text-ink-sub">—</span>
                        : <><span className="tabular font-medium text-ink-main">{fmtMan(r.mainInc)}</span><span className="text-xs text-ink-sub ml-0.5">万円</span></>}
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap border-l-2 border-line-card">
                      {!b.spouseEnabled
                        ? <span className="text-ink-sub">—</span>
                        : <>
                            <span className="tabular font-medium text-ink-main">{r.spAge}</span>
                            <span className="text-xs text-ink-sub ml-0.5">歳</span>
                            {r.spRetired && <span className="text-ink-sub text-[10px] ml-1.5">(退職後)</span>}
                          </>}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {!b.spouseEnabled
                        ? <span className="text-ink-sub">—</span>
                        : r.spRetired
                          ? <span className="text-ink-sub">—</span>
                          : <><span className="tabular font-medium text-ink-main">{fmtMan(r.spInc)}</span><span className="text-xs text-ink-sub ml-0.5">万円</span></>}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap border-l-2 border-line-card bg-status-ok/5">
                      {r.total > 0
                        ? <><span className="tabular font-bold text-status-ok text-base">{fmtMan(r.total)}</span><span className="text-xs text-ink-sub ml-0.5">万円</span></>
                        : <span className="text-ink-sub">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Card>
    </div>
  );
}

// ─── 昇給モード切替＋（自動なら%）/（手動なら5年テーブル）───
function SalaryModeBlock({ label, auto, onAutoChange, growth, onGrowthChange, manual, onManualChange }: {
  label: string;
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  growth: number;
  onGrowthChange: (v: number) => void;
  manual: number[];
  onManualChange: (arr: number[]) => void;
}) {
  const updateManual = (i: number, v: number) => {
    const arr = [...manual];
    arr[i] = v;
    onManualChange(arr);
  };
  return (
    <Section title={label}>
      <div className="flex rounded-[8px] border border-line-card overflow-hidden w-fit mt-2">
        <button
          type="button"
          className={`px-3 py-1.5 text-sm transition-colors ${auto ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
          onClick={() => onAutoChange(true)}
        >自動</button>
        <button
          type="button"
          className={`px-3 py-1.5 text-sm transition-colors ${!auto ? 'bg-accent-blue text-white' : 'bg-bg-card text-ink-main hover:bg-bg-panel'}`}
          onClick={() => onAutoChange(false)}
        >手動</button>
      </div>
      {auto ? (
        <div className="mt-3">
          <Field label="年間上昇率"><NumInput value={growth} onChange={onGrowthChange} step={0.1} suffix="%/年" /></Field>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {SALARY_AGES.map((ag, i) => (
            <Field key={ag} label={`${ag}歳`}>
              <NumInput value={manual[i] ?? 0} onChange={v => updateManual(i, v)} suffix="万" />
            </Field>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── 共通設定のアイコン付きタイル ───
const TILE_COLORS = {
  blue:   { ring: 'ring-accent-blue/20',   bg: 'bg-accent-blue/8',   label: 'text-accent-blue',   icon: 'bg-accent-blue/15'   },
  green:  { ring: 'ring-status-ok/20',     bg: 'bg-status-ok/8',     label: 'text-status-ok',     icon: 'bg-status-ok/15'     },
  orange: { ring: 'ring-status-warn/20',   bg: 'bg-status-warn/8',   label: 'text-status-warn',   icon: 'bg-status-warn/15'   },
  purple: { ring: 'ring-status-danger/20', bg: 'bg-status-danger/8', label: 'text-status-danger', icon: 'bg-status-danger/15' },
} as const;

function SettingTile({ icon, label, accent, children }: { icon: string; label: string; accent: keyof typeof TILE_COLORS; children: React.ReactNode }) {
  const c = TILE_COLORS[accent];
  return (
    <div className={`bg-bg-panel border border-line-table rounded-[12px] p-5 transition-shadow hover:shadow-card flex flex-col`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold tabular tracking-tighter ${c.icon} ${c.label} border ${c.label.replace('text-', 'border-')}/30`}>
          {icon}
        </div>
        <span className={`text-[13px] font-bold tracking-wider ${c.label}`}>{label}</span>
      </div>
      <div className="mt-auto">
        {children}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-sub">{label}</span>
      <span className="tabular text-ink-main font-medium">{value}</span>
    </div>
  );
}
