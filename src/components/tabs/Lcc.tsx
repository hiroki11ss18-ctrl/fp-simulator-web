import { Plus, Trash2 } from 'lucide-react';
import { Field, NumInput, Select, TextInput } from '../ui';
import type { SimData, CalcResult, HouseholdExpenses, SuddenExpense } from '../../types';
import { fmt } from '../../lib/format';
import { childrenOf, childEducation, EDUCATION_SOURCE, STUDY_YEARS } from '../../lib/education';

const workFields: [keyof HouseholdExpenses, string][] = [
  ['food', '食費'], ['transport', '交通費'], ['daily', '日用品'], ['clothes', '衣服'], ['hobby', '娯楽・趣味'],
  ['car', '車の維持費'], ['social', '交際費'], ['medical', '医療費'], ['other', 'その他'],
  ['ins1', '生命保険'], ['ins2', '医療保険'], ['ins3', 'がん保険'], ['ins4', '自動車保険'], ['ins5', '火災・地震保険'], ['ins6', 'その他保険'],
];
const retiredFields: [keyof HouseholdExpenses, string][] = [
  ['retFood', '食費'], ['retTransport', '交通費'], ['retDaily', '日用品'], ['retClothes', '衣服'], ['retHobby', '娯楽・趣味'],
  ['retCar', '車の維持費'], ['retSocial', '交際費'], ['retMedical', '医療費'], ['retOther', 'その他'],
  ['retIns1', '生命・医療保険'], ['retIns2', '自動車保険'], ['retIns3', '火災・地震保険'], ['retIns4', 'その他保険'],
];
const kidKeys = [
  { age: 'c1age', mid: 'c1mid', high: 'c1high', uni: 'c1uni', alone: 'c1alone' },
  { age: 'c2age', mid: 'c2mid', high: 'c2high', uni: 'c2uni', alone: 'c2alone' },
  { age: 'c3age', mid: 'c3mid', high: 'c3high', uni: 'c3uni', alone: 'c3alone' },
] as const;
const options = (values: string[]) => values.map(value => ({ value, label: value }));

export default function Lcc({ data, update, calc }: { data: SimData; update: (p: Partial<SimData>) => void; calc: CalcResult }) {
  const h = data.household, b = data.basic;
  const set = (patch: Partial<HouseholdExpenses>) => update({ household: { ...h, ...patch } });
  const updateExpense = (id: string, patch: Partial<SuddenExpense>) => update({ suddenExpenses: data.suddenExpenses.map(e => e.id === id ? { ...e, ...patch } : e) });
  const addExpense = (name = '', cycle = 1) => update({ suddenExpenses: [...data.suddenExpenses, { id: crypto.randomUUID(), name, amount: 0, cycleYears: cycle, firstYear: cycle, endYear: 60, once: false }] });
  const renderFields = (fields: typeof workFields) => <div className="form-grid dense">{fields.map(([key, label]) => <Field key={key} label={label}><NumInput value={h[key]} onChange={v => set({ [key]: v })} step={0.1} suffix="万円/月" /></Field>)}</div>;
  return <div className="plan-layout">
    <section className="plan-section">
      <div className="section-heading"><h2>現役中の生活費</h2><span>世帯全体 / 現在価格の月額</span></div>
      <p className="plan-note mb-4">世帯主が{b.retireAge}歳になる前の生活費・掛捨保険です。住宅ローン・教育費・税金・旅行・修繕は別に計上します。</p>
      {renderFields(workFields)}
      <p className="plan-note">車の維持費と買い替え費、趣味・交際費と旅行費、教育費に含まれる塾・習い事の重複に注意。年払いの保険は12で割った月額で計上します。</p>
    </section>
    <section className="plan-section">
      <h2>光熱費・物価</h2><div className="form-grid">
        <Field label="太陽光導入前の電気代" hint="太陽光・蓄電池の電気代と共通">
          <NumInput value={calc.effectiveElecBill} onChange={v => update({ household: { ...h, electricMonthly: 0 }, solar: { ...data.solar, elecBillManual: v } })} suffix="万円/月" step={0.1} />
          <button className="text-xs text-accent-blue mt-1" onClick={() => update({ household: { ...h, electricMonthly: 0 }, solar: { ...data.solar, elecBillManual: null } })}>使用量からの計算に戻す</button>
        </Field>
        <Field label="ガス・灯油"><NumInput value={h.gasMonthly} onChange={v => set({ gasMonthly: v })} suffix="万円/月" step={0.1} /></Field>
        <Field label="水道"><NumInput value={h.waterMonthly} onChange={v => set({ waterMonthly: v })} suffix="万円/月" step={0.1} /></Field>
        <Field label="物価上昇率" hint="生活・光熱・教育・修繕・予定支出に適用。借入・保険積立・税評価額・売電単価は対象外。"><NumInput value={h.inflationRate} onChange={v => set({ inflationRate: v })} suffix="%/年" max={20} step={0.1} /></Field>
      </div>
      <p className="plan-note">初年度の光熱費は節電後 {fmt(calc.rows[0].utility / 12, 2)} 万円/月。売電は別の収入です。オール電化の場合も使用量・料金を確認し、ガス・灯油を0円にしてください。</p>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>退職後の生活費</h2><span>世帯全体 / 現在価格の月額</span></div>
      <p className="plan-note mb-4">世帯主が{b.retireAge}歳になった年からの生活費・掛捨保険です。配偶者が就業中でもこの金額へ切り替えます。将来の物価上昇は別途加算し、住宅ローン・教育費・税金・旅行・修繕は別に計上します。</p>
      {renderFields(retiredFields)}
      <div className="form-grid mt-4"><Field label="退職後の光熱費合計（節電前）" hint="0は現役期と同額。太陽光の節電額を別途差し引きます。"><NumInput value={h.retUtility} onChange={v => set({ retUtility: v })} suffix="万円/月" step={0.1} /></Field></div>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>旅行・車の買い替え・予定支出</h2><span>{data.simYears}年間合計 {fmt(calc.lifeExpSudden)}万円</span></div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="action-button" onClick={() => addExpense('家族旅行', 1)}><Plus size={16} />旅行</button>
        <button className="action-button" onClick={() => addExpense('車の買い替え', 8)}><Plus size={16} />車の買い替え</button>
        <button className="action-button" onClick={() => addExpense()}><Plus size={16} />予定支出</button>
      </div>
      {data.suddenExpenses.length === 0 && <p className="plan-note">予定支出は未設定です。</p>}
      {data.suddenExpenses.map(e => <div className="event-row" key={e.id}>
        <Field label="支出名"><TextInput value={e.name} onChange={name => updateExpense(e.id, { name })} placeholder="家族旅行など" /></Field>
        <Field label="1回の費用"><NumInput value={e.amount} onChange={amount => updateExpense(e.id, { amount })} step={1} suffix="万円" /></Field>
        <Field label="最初の支出"><NumInput value={e.firstYear ?? e.cycleYears} onChange={firstYear => updateExpense(e.id, { firstYear: Math.round(firstYear) })} min={1} max={60} step={1} suffix="年目" /></Field>
        <Field label="繰り返し"><Select value={e.once ? 'once' : 'repeat'} onChange={v => updateExpense(e.id, { once: v === 'once' })} options={[{ value: 'repeat', label: '定期的' }, { value: 'once', label: '1回だけ' }]} /></Field>
        {!e.once && <><Field label="間隔"><NumInput value={e.cycleYears} onChange={cycleYears => updateExpense(e.id, { cycleYears: Math.round(cycleYears) })} min={1} max={60} step={1} suffix="年ごと" /></Field>
          <Field label="最後の対象年"><NumInput value={e.endYear ?? 60} onChange={endYear => updateExpense(e.id, { endYear: Math.round(endYear) })} min={1} max={60} step={1} suffix="年目" /></Field></>}
        <button className="icon-button danger" title="予定支出を削除" onClick={() => update({ suddenExpenses: data.suddenExpenses.filter(x => x.id !== e.id) })}><Trash2 size={17} /></button>
      </div>)}
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>お子さまの進路・教育費</h2><span>{data.simYears}年間合計 {fmt(calc.totalEdu)}万円</span></div>
      <div className="form-grid mb-4">
        <Field label="お子さまの人数"><NumInput value={b.kids} onChange={v => update({ basic: { ...b, kids: Math.round(v) } })} max={3} step={1} suffix="人" /></Field>
        <Field label="下宿の仕送り"><NumInput value={b.aloneMonthly} onChange={v => update({ basic: { ...b, aloneMonthly: v } })} step={0.1} suffix="万円/月" /></Field>
      </div>
      {childrenOf(b).map((k, i) => {
        const keys = kidKeys[i];
        const remaining = Array.from({ length: data.simYears }, (_, y) => childEducation(k, y, b, data.educationCosts) * (1 + h.inflationRate / 100) ** y).reduce((a, v) => a + v, 0);
        return <div className="education-row" key={i}><h3>第{i + 1}子 / これからの教育費 {fmt(remaining)}万円</h3>
          <div className="form-grid dense">
            <Field label="現在の年齢"><NumInput value={k.age} onChange={v => update({ basic: { ...b, [keys.age]: Math.round(v) } })} max={35} step={1} suffix="歳" /></Field>
            <Field label="中学"><Select value={k.mid} onChange={v => update({ basic: { ...b, [keys.mid]: v } })} options={options(['公立中学', '私立中学'])} /></Field>
            <Field label="高校"><Select value={k.high} onChange={v => update({ basic: { ...b, [keys.high]: v } })} options={options(['公立高校', '私立高校'])} /></Field>
            <Field label="高校卒業後"><Select value={k.uni} onChange={v => update({ basic: { ...b, [keys.uni]: v } })} options={options(Object.keys(STUDY_YEARS))} /></Field>
            <Field label="下宿期間"><NumInput value={k.alone} onChange={v => update({ basic: { ...b, [keys.alone]: Math.round(v) } })} max={STUDY_YEARS[k.uni] ?? 0} step={1} suffix="年" /></Field>
          </div></div>;
      })}
      <details className="mt-4"><summary>教育費の年間設定・出典</summary>
        <div className="form-grid dense mt-4">{Object.entries(data.educationCosts).filter(([k]) => k !== '就職').map(([key, value]) => <Field key={key} label={key}><NumInput value={value} onChange={v => update({ educationCosts: { ...data.educationCosts, [key]: v } })} suffix="万円/年" step={0.1} /></Field>)}</div>
        <p className="plan-note">3〜5歳は公立幼稚園、6〜11歳は公立小学校を初期値とします。幼稚園〜高校の初期値は<a href={EDUCATION_SOURCE} target="_blank" rel="noreferrer">文部科学省 令和5年度学習費調査（訂正後）</a>。給食・学校外活動を含みます。大学・専門学校は旧版の仮予算を引き継いでいます。学校の学費・入学金・教材・通学費・下宿費で必ず再確認してください。0〜2歳の保育料・入学一時金は予定支出に別途計上します。</p>
      </details>
    </section>
    <section className="plan-section">
      <div className="section-heading"><h2>貯蓄型保険・学資保険</h2><button className="action-button" onClick={() => update({ savingsInsurances: [...data.savingsInsurances, { id: crypto.randomUUID(), name: '', monthly: 0, payoutYear: 18, payoutAmount: 0 }] })}><Plus size={16} />追加</button></div>
      {data.savingsInsurances.map(si => {
        const setSi = (patch: Partial<typeof si>) => update({ savingsInsurances: data.savingsInsurances.map(x => x.id === si.id ? { ...x, ...patch } : x) });
        return <div className="event-row" key={si.id}>
          <Field label="保険名"><TextInput value={si.name} onChange={name => setSi({ name })} /></Field>
          <Field label="毎月の保険料"><NumInput value={si.monthly} onChange={monthly => setSi({ monthly })} suffix="万円" step={0.1} /></Field>
          <Field label="満期・払込終了"><NumInput value={si.payoutYear} onChange={payoutYear => setSi({ payoutYear: Math.round(payoutYear) })} min={1} max={60} suffix="年目" step={1} /></Field>
          <Field label="満期受取額（手取り）"><NumInput value={si.payoutAmount} onChange={payoutAmount => setSi({ payoutAmount })} suffix="万円" /></Field>
          <button className="icon-button danger" title="保険を削除" onClick={() => update({ savingsInsurances: data.savingsInsurances.filter(x => x.id !== si.id) })}><Trash2 size={17} /></button>
        </div>;
      })}
      <p className="plan-note">満期年の末まで毎月支払い、同年末に受け取る仮定。払込終了と満期が異なる商品はこの欄だけでは表現できません。積立残高は手元資金に含めず、受取時に加算します。</p>
    </section>
  </div>;
}
