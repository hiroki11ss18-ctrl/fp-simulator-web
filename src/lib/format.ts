/** 数値→「1,234」 */
export function fmt(n: number, digits = 0): string {
  if (!isFinite(n)) return '-';
  return n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** 万円表記 */
export function fmtMan(n: number): string {
  return fmt(Math.round(n));
}
/** 円表記 */
export function fmtYen(n: number): string {
  return fmt(Math.round(n));
}
/** 千円→億円混合 */
export function fmtBig(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 10000).toFixed(2)}億`;
  return `${fmt(Math.round(n))}万`;
}
