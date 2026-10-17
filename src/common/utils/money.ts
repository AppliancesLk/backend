// Fixed two-decimal, nonnegative amounts. Never round trusted PostgreSQL
// numeric strings through a JavaScript Number.
export function toMinorUnits(value: string | number): bigint {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new RangeError('Invalid monetary amount');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function formatMinorUnits(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
