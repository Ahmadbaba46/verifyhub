/** kobo -> "₦12,450.00" */
export function naira(kobo: number | string | bigint, opts: { decimals?: boolean } = {}): string {
  const n = Number(kobo) / 100;
  const decimals = opts.decimals ?? !Number.isInteger(n);
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 });
}

/** "5,000" or "5000.50" -> kobo, or null when invalid */
export function parseNairaToKobo(input: string | number): number | null {
  const s = String(input).replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
