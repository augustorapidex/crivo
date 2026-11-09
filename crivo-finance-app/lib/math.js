/** Crivo Finance — calculations use integer cents and UTC calendar days. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Data inválida.');
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) throw Error('Data inválida.');
  return value;
}
export function daysInMonth(y, month) { return new Date(Date.UTC(y, month, 0)).getUTCDate(); }
export function monthlyDate(iso, shift = 0, dayOverride) {
  const [y, m, day] = isoDate(iso).split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + shift, 1));
  const year = shifted.getUTCFullYear(), month = shifted.getUTCMonth() + 1;
  const resultDay = clamp(dayOverride ?? day, 1, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(resultDay).padStart(2, '0')}`;
}
export function splitCents(total, count) {
  if (!Number.isSafeInteger(total) || total <= 0) throw Error('Valor inválido.');
  if (!Number.isInteger(count) || count < 1 || count > 120) throw Error('Número de parcelas inválido (1 a 120).');
  const each = Math.floor(total / count);
  if (each <= 0) throw Error('O valor precisa permitir ao menos um centavo por parcela.');
  return Array.from({ length: count }, (_, i) => each + (i === count - 1 ? total - each * count : 0));
}
export function cardFirstDue(purchaseDate, closingDay, dueDay) {
  isoDate(purchaseDate);
  if (![closingDay, dueDay].every(n => Number.isInteger(n) && n >= 1 && n <= 31)) throw Error('Dias do cartão inválidos.');
  const [y, m, day] = purchaseDate.split('-').map(Number);
  const closingActual = Math.min(closingDay, daysInMonth(y, m));
  // Purchases through closing day belong to current statement, otherwise the next.
  // A statement whose due day precedes/equal closing day is paid the following month.
  const shift = (day > closingActual ? 1 : 0) + (dueDay <= closingDay ? 1 : 0);
  return monthlyDate(`${y}-${String(m).padStart(2,'0')}-01`, shift, dueDay);
}
export function todayBrazil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dayDifference(due, today) { return Math.round((Date.parse(`${isoDate(due)}T00:00:00Z`) - Date.parse(`${isoDate(today)}T00:00:00Z`)) / 86400000); }
export function positiveCents(value) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 900000000000) throw Error('Valor inválido.'); return n; }
export function monthKey(date) { return isoDate(date).slice(0, 7); }
export function monthRange(value) { const month = `${value}-01`; isoDate(month); return [month, monthlyDate(month, 1)]; }
