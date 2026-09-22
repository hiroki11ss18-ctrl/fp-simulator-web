// 全シミュレーションのデータ型定義

export type SimYears = 30 | 40 | 50 | 60;

export type SchoolType = 'public' | 'private';
export type LoanType = 'var' | 'fix';
export type HouseType = 'long_term' | 'zeh' | 'general';

// ─── 基本情報 ───
export interface BasicInfo {
  customerName: string;
  staffName: string;
  date: string;
  // 世帯主
  age: number;
  income: number;           // 年収 万円
  annualBonusInc: number;   // 年間ボーナス 万円
  incomeGrowth: number;     // 昇給率 %/年（自動計算用）
  salaryAuto: boolean;      // 自動計算ON
  salaryManual: number[];   // 手動入力: 5年ごとの年収 [30,35,40,45,50,55,60,65歳]
  retireAge: number;
  retireBonus: number;      // 退職金 万円
  // 配偶者
  spouseEnabled: boolean;
  spouseAge: number;
  spouseIncome: number;
  spouseAnnualBonusInc: number;
  spouseGrowth: number;
  spouseRetireAge: number;
  spouseRetireBonus: number;
  salSpouseAuto: boolean;
  spouseSalaryManual: number[]; // 手動入力: 5年ごとの年収
  // 配偶者 産休・育休シミュレーション
  spouseLeaveEnabled: boolean;
  spouseLeaveStartYear: number;    // 何年後に産休・育休開始
  spouseLeaveMonths: number;       // 休業期間（月）
  spouseMaternityMonths: number;   // 産休相当期間（月）
  spouseReturnIncomeRate: number;  // 復帰後の収入率 %
  // 共通
  pensionStartAge: number;
  takeHomePct: number;
  spouseTakeHomePct: number;
  pensionMonthly: number | null;
  spousePensionMonthly: number | null;
  emergencyFundMonths: number;
  savings: number;          // 現在の貯蓄額（世帯主） 万円
  spouseSavings: number;    // 現在の貯蓄額（配偶者） 万円
  kids: number;             // 子どもの人数（0〜4）
  loanBorrowType: 'single' | 'pair';   // 借入形態: 単独 / ペアローン
  // 子ども別教育設定（最大4人分）
  c1age: number; c1mid: string; c1high: string; c1uni: string; c1alone: number;
  c2age: number; c2mid: string; c2high: string; c2uni: string; c2alone: number;
  c3age: number; c3mid: string; c3high: string; c3uni: string; c3alone: number;
  aloneMonthly: number;     // 一人暮らし仕送り月額 万円
  // 生活費（LCCシートで詳細設定するため、ここはデフォルト値保持）
  livingCostMonthly: number;   // 現役期 生活費月額（詳細未設定時フォールバック）
  livingCostRetired: number;   // 退職後 生活費月額
}

// ─── 住宅資金計画 ───
export interface HousingPlan {
  land: number;           // 土地 万円
  building: number;       // 建物（本体） 万円
  fuka: number;           // 付帯工事 万円
  exterior: number;       // 外構 万円
  miscMode: 'pct' | '100'; // 諸費用モード
  miscPct: number;        // 諸費用率 %
  down: number;           // 頭金 万円
  repRatio: number;       // 返済比率 %
  reviewRate: number;     // 最大借入額の試算に使う審査金利 %
  actualLoan: number;     // 実際の借入額（0=自動）
  // 固定資産税
  buildArea: number;                   // 建坪（坪）
  landArea: number;                    // 土地面積（坪）
  propTaxBuildingValue: number | null; // null=自動（建物本体価格×45%）
  propTaxLandValue: number | null;     // null=自動（土地代×70%）
  cityPlanningTaxEnabled: boolean;     // 都市計画税の課税区域か
}

// ─── ローン計画 ───
export interface LoanPlan {
  years: number;
  loanType: LoanType;     // 採用金利タイプ
  // 変動金利 3期設定
  varRate1: number; varPeriod1: number;
  varRate2: number; varPeriod2: number;
  varRate3: number;
  // 固定金利 3期設定
  fixRate1: number; fixPeriod1: number;
  fixRate2: number; fixPeriod2: number;
  fixRate3: number;
  // ボーナス払い
  bonusAmount: number;    // 1回あたり 万円
  bonusTimes: number;     // 回/年
  // 繰り上げ返済（2回まで）
  pyear: number; pamount: number;
  pyear2: number; pamount2: number;
  ptype: '期間短縮' | '返済額軽減';
  // 住宅ローン減税
  taxHouseType: HouseType;
  taxMoveInYear: number;
  taxLoanAmount: number;   // 控除計算に使う借入額（0 = 実借入額を自動採用）
  taxPairMainShare: number; // ペアローン時の主の負担率 %（既定 50）
  taxSpecialHousehold: boolean; // 子育て・若者夫婦世帯の上乗せ対象か
  // 長期優良住宅フラグ
  isLongTermHouse: boolean;
  taxInclude: boolean;
  taxAnnualCap: number;
  taxSpouseAnnualCap: number;
}

// ─── 太陽光・蓄電池 ───
export interface SolarBattery {
  enabled: boolean;        // 太陽光 導入ON/OFF
  funding: 'included' | 'cash' | 'loan';
  generationYield: number;
  degradationPct: number;
  batteryEfficiencyPct: number;
  baseChargeMonthly: number;
  panelLifeYears: number;
  panelReplace: boolean;
  panelReplaceCost: number;
  battEnabled: boolean;    // 蓄電池 導入ON/OFF（太陽光ONが前提）
  solarKw: number;         // パネル容量 kW
  powerconKw: number;      // パワコン容量 kW
  solarCost: number;       // 設置費用 万円
  battCost: number;        // 蓄電池費用 万円
  battCapacity: number;    // 蓄電池容量 kWh
  fitRate: number;         // FIT売電単価 円/kWh
  fitStepYears: number;
  fitRateMiddle: number;
  fitRateAfter: number;    // FIT後単価
  fitYears: number;        // FIT期間
  elecPriceDay: number;    // 昼間買電単価 円/kWh
  elecPriceNight: number;  // 夜間買電単価
  dayUsageRatio: number;   // 昼間使用比率 %
  monthlyUsage: number;    // 月間電気使用量 kWh
  elecBillManual: number | null; // 電気代手動入力（null=自動）
  genAuto: boolean;        // 月別発電量自動計算
  genM: number[];          // 手動月別発電量（12個）
  genAnnualKwh: number;    // 年間発電量の手動指定（0=自動: パネル×1100×効率）
  selfRateManual: boolean;
  selfRateSolar: number;   // 太陽光のみ自家消費率 %
  selfRateBatt: number;    // 太陽光+蓄電池自家消費率 %
  powerconCost: number;    // パワコン交換費 万円
  powerconCycle: number;   // パワコン交換サイクル 年
  battReplaceCost: number;
  battReplaceCycle: number;
  solarMaintCost: number;
  solarMaintCycle: number;
}

// ─── メンテナンス ───
export interface MaintItem {
  id: string;
  name: string;
  cycleYears: number;
  cost: number;
  enabled: boolean;
}

export interface Maintenance {
  items: MaintItem[];
}

// ─── 家計費 ───
export interface HouseholdExpenses {
  // 現役期 月額 万円
  food: number; transport: number; daily: number;
  clothes: number; hobby: number; car: number;
  social: number; medical: number; other: number;
  otherLoan: number;   // 住宅以外のローン月返済
  otherLoanBalance: number;
  otherLoanRate: number;
  otherLoanMonths: number;
  // 保険 月額（6項目）
  ins1: number; ins2: number; ins3: number; ins4: number; ins5: number; ins6: number;
  // 退職後 月額 万円
  retFood: number; retUtility: number; retTransport: number; retDaily: number;
  retClothes: number; retHobby: number; retCar: number; retSocial: number;
  retMedical: number; retOther: number;
  retIns1: number; retIns2: number; retIns3: number; retIns4: number;
  // 光熱費（LCCシートで設定）
  electricMonthly: number; gasMonthly: number; waterMonthly: number;
  inflationRate: number;
}

// ─── 急な出費（フリー入力） ───
export interface SuddenExpense {
  id: string;
  name: string;
  amount: number;      // 万円
  cycleYears: number;  // 何年ごとに発生するか（周期）。0 なら無効
  firstYear?: number;
  endYear?: number;
  once?: boolean;
}

// ─── 貯蓄型保険（学資・養老・個人年金など） ───
export interface SavingsInsurance {
  id: string;
  name: string;
  monthly: number;       // 月々の保険料（万円/月）
  payoutYear: number;    // 満期年（何年後に受け取るか・経過年数）
  payoutAmount: number;  // 満期受取金額（万円）
}

// ─── シミュレーションデータ全体 ───
export interface SimData {
  basic: BasicInfo;
  housing: HousingPlan;
  loan: LoanPlan;
  solar: SolarBattery;
  maint: Maintenance;
  household: HouseholdExpenses;
  simYears: SimYears;
  suddenExpenses: SuddenExpense[];
  savingsInsurances: SavingsInsurance[];
  educationCosts: Record<string, number>;
  stress: { rateAdd: number; incomeDropPct: number; expenseAddPct: number };
  reviewChecks: { income: boolean; expenses: boolean; housing: boolean; education: boolean; energy: boolean };
}

// ─── 計算結果 ───
export interface YearRow {
  year: number;       // 経過年
  calYear: number;
  age: number;
  income: number;     // 年収入（手取り概算）万円
  loanPay: number;
  living: number;     // 生活費（光熱費除く）
  utility: number;    // 光熱費
  propTax: number;
  eduCost: number;
  maintCost: number;
  solarBenefit: number; // 売電収入。節電はutilityを減額して計上
  leaveIncomeLoss: number; // 産休・育休による収入減
  sudden: number;     // 急な出費（年間合計）
  taxBack: number;    // 住宅ローン控除（年額）
  retBonus: number;   // 退職金
  net: number;        // 年収支
  balance: number;    // 資産残高
  status: 'great' | 'normal' | 'caution' | 'danger' | 'big';
  events: string[];
  loanBalance: number;
  wage: number;
  pension: number;
  insurancePayout: number;
  insurancePremium: number;
  otherLoanPay: number;
  otherLoanBalance: number;
  solarSaving: number;
  solarSale: number;
  prepaid: number;
  totalOut: number;
}

export interface CalcResult {
  rows: YearRow[];
  initialSavings: number;
  initialCash: number;
  cashRequired: number;
  solarInitial: number;
  warnings: string[];
  loan: number;         // 実借入額 万円
  loanAuto: number;     // 自動借入額
  miscAmt: number;      // 諸費用額
  totalCost: number;    // 総費用
  monthly: number;      // 月返済（採用金利第1期）万円
  monthlyPhase1: number; // 1期 月返済（万円）
  monthlyPhase2: number; // 2期 月返済（万円）
  monthlyPhase3: number; // 3期 月返済（万円）
  repaymentYears: number; // 実質返済期間（繰上返済反映後）
  completionAge: number;
  actualTotalRepay: number;
  actualTotalInt: number;
  taxBorrowLimit: number;
  taxDeductionYears: number;
  taxDeductionTotal: number;
  taxDeductionMain: number;
  taxDeductionSpouse: number;
  // LCC集計
  totalUtility: number;
  totalPropTax: number;
  totalEdu: number;
  totalMaint: number;
  totalSolar: number;
  totalLiving: number;
  lccGrand: number;
  // 太陽光
  solarAnnualFit: number;
  solarAnnualPost: number;
  annualKwh: number;
  afterBill: number;    // 太陽光後の月電気代 万円
  effectiveElecBill: number; // 現在の電気代 万円/月
  // 年金
  pensionM: number;
  spPensionM: number;
  // 生涯集計（simYears期間内）— 提案書サマリー用
  lifeIncWage: number;       // 給与収入（現役期）
  lifeIncPension: number;    // 年金収入（退職後）
  lifeIncRetBonus: number;   // 退職金
  lifeIncTaxBack: number;    // 住宅ローン控除
  lifeIncSolar: number;      // 太陽光効果（節電+売電）
  lifeIncSiPayout: number;   // 貯蓄型保険 満期受取
  lifeLeaveIncomeLoss: number; // 産休・育休による収入減
  lifeExpLoanPay: number;    // ローン返済合計
  lifeExpPropTax: number;    // 固定資産税合計
  lifeExpLiving: number;     // 生活費合計
  lifeExpUtility: number;    // 光熱費合計
  lifeExpEdu: number;        // 教育費合計
  lifeExpMaint: number;      // メンテナンス合計
  lifeExpSudden: number;     // 急な出費合計
  lifeExpSiPaid: number;     // 貯蓄型保険 払込合計
}
