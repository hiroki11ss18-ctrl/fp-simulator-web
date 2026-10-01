export const clamp = (n: number, min = 0, max = Infinity) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
