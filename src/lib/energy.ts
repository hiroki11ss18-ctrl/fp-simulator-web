import type { SolarBattery, SimData } from '../types';
import { MFACTORS } from './defaults';

export const ENERGY_SOURCE = 'https://www.env.go.jp/content/000323423.pdf#page=48';
// 環境省 令和5年度確報 図1-62の表示値(GJ/年)。1kWh = 0.0036GJ。
export const HOUSEHOLD_ENERGY = [8.7, 14.3, 18.5, 20.6, 23.2, 32.3].map((gj, i) => ({
  people: i + 1, label: i === 5 ? '6人以上' : `${i + 1}人`,
  monthlyKwh: Math.round(gj / 0.0036 / 12),
}));
const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const clamp = (n: number, min = 0, max = Infinity) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export function solarMonthlyGenArr(s: SolarBattery): number[] {
  if (!s.genAuto && s.genM.length === 12) return s.genM.map(n => clamp(n));
  const annual = s.genAnnualKwh > 0 ? s.genAnnualKwh
    : clamp(s.solarKw) * clamp(s.generationYield ?? 1000) * (s.solarKw > 0 ? clamp(s.powerconKw / s.solarKw, 0, 1) : 0);
  const sum = MFACTORS.reduce((a, b) => a + b, 0);
  return MFACTORS.map(f => annual * f / sum);
}

export function solarInitialCost(s: SolarBattery) {
  return s.enabled && s.solarKw > 0 ? s.solarCost + (s.battEnabled ? s.battCost : 0) : 0;
}

export function solarMaintenance(s: SolarBattery, year: number) {
  if (!s.enabled || s.solarKw <= 0) return 0;
  const life = Math.max(1, Math.round(s.panelLifeYears ?? 30));
  if (!s.panelReplace && year >= life) return 0;
  return (s.panelReplace && year % life === 0 ? s.panelReplaceCost : 0)
    + (s.powerconCycle > 0 && year % s.powerconCycle === 0 ? s.powerconCost : 0)
    + (s.solarMaintCycle > 0 && year % s.solarMaintCycle === 0 ? s.solarMaintCost : 0)
    + (s.battEnabled && s.battReplaceCycle > 0 && year % s.battReplaceCycle === 0 ? s.battReplaceCost : 0);
}

/** 月別平均モデル。充放電損失、昼夜需要、蓄電容量で物理量を制限する。 */
export function energyYear(data: Pick<SimData, 'solar' | 'household'>, yearIndex = 0) {
  const s = data.solar;
  const ratio = clamp(s.dayUsageRatio / 100, 0, 1);
  const efficiency = clamp((s.batteryEfficiencyPct ?? 90) / 100, 0, 1);
  const life = Math.max(1, Math.round(s.panelLifeYears ?? 30));
  const panelAge = s.panelReplace ? yearIndex % life : yearIndex;
  const active = s.enabled && s.solarKw > 0 && (s.panelReplace || yearIndex < life);
  const decay = (1 - clamp(s.degradationPct ?? 0.5, 0, 100) / 100) ** panelAge;
  const batteryActive = s.battEnabled && (s.battReplaceCycle > 0 || yearIndex < 15);
  const gen = solarMonthlyGenArr(s);
  const fitRate = yearIndex >= s.fitYears ? s.fitRateAfter : yearIndex < (s.fitStepYears ?? s.fitYears) ? s.fitRate : s.fitRateMiddle;
  const months = gen.map((base, i) => {
    const generation = active ? base * decay : 0;
    const dayDemand = clamp(s.monthlyUsage) * ratio;
    const nightDemand = clamp(s.monthlyUsage) * (1 - ratio);
    const targetDirect = s.selfRateManual ? generation * clamp(s.selfRateSolar / 100, 0, 1) : generation;
    const direct = Math.min(generation, dayDemand, targetDirect);
    const batteryTarget = s.selfRateManual ? Math.max(0, generation * clamp(s.selfRateBatt / 100, 0, 1) - direct) : Infinity;
    const delivered = batteryActive ? Math.min((generation - direct) * efficiency, nightDemand,
      clamp(s.battCapacity) * days[i] * efficiency, batteryTarget) : 0;
    const charged = efficiency > 0 ? delivered / efficiency : 0;
    const sold = Math.max(0, generation - direct - charged);
    const saving = (direct * s.elecPriceDay + delivered * s.elecPriceNight) / 1e4;
    const sale = sold * fitRate / 1e4;
    return { month: i + 1, generation, direct, delivered, charged, sold,
      loss: charged - delivered, purchased: dayDemand + nightDemand - direct - delivered, saving, sale };
  });
  const sum = (key: keyof typeof months[number]) => months.reduce((a, m) => a + m[key], 0);
  const autoBill = clamp(s.baseChargeMonthly ?? 0) + s.monthlyUsage * (ratio * s.elecPriceDay + (1 - ratio) * s.elecPriceNight) / 1e4;
  // 旧LCCの手入力を維持。新UIは太陽光設定の手入力に一本化。
  const baselineMonthly = data.household.electricMonthly > 0 ? data.household.electricMonthly : s.elecBillManual ?? autoBill;
  const saving = Math.min(Math.max(0, baselineMonthly - (s.baseChargeMonthly ?? 0)) * 12, sum('saving'));
  return { months, generation: sum('generation'), direct: sum('direct'), delivered: sum('delivered'),
    sold: sum('sold'), saving, sale: sum('sale'), benefit: saving + sum('sale'),
    baselineMonthly, afterMonthly: Math.max(0, baselineMonthly - saving / 12) };
}
