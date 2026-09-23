import type { SimData } from '../types';

export const BUILDING_ASSESSMENT_RATIO = 0.45;
export const LAND_ASSESSMENT_RATIO = 0.70;
// Planning assumptions, not municipal assessment rates (10,000 yen per tsubo).
export const BUILD_EVAL_PER_TSUBO_FALLBACK = 38;
export const LAND_EVAL_PER_TSUBO_FALLBACK = 11;

export function legacyAssessment(price: number, ratio: number, area: number, fallback: number) {
  return Math.round(price > 0 ? price * ratio : area * fallback);
}

export function propertyAssessment(h: SimData['housing']) {
  return {
    buildAuto: Math.round(h.buildArea * h.propTaxBuildingUnitValue),
    landAuto: Math.round(h.landArea * h.propTaxLandUnitValue),
  };
}
