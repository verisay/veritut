/** Türkçe biçimleyiciler — elle biçimlemek yasak, bileşenler bunları kullanır. */
const trDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const trDateTime = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const trNumber = new Intl.NumberFormat('tr-TR');
const trPercent = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatDate(d: Date | string): string {
  return trDate.format(typeof d === 'string' ? new Date(d) : d);
}
export function formatDateTime(d: Date | string): string {
  return trDateTime.format(typeof d === 'string' ? new Date(d) : d);
}
export function formatNumber(n: number): string {
  return trNumber.format(n);
}
/** 99.98 → "%99,98" — uptime sütunları. */
export function formatPercent(n: number): string {
  return `%${trPercent.format(n)}`;
}
export function formatMoney(amount: number, currency: 'TRY' | 'EUR' | 'USD' = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
}
/** Kuruşsuz para — pazarlama "başlangıç fiyatı" sütunları: 1150 → "₺1.150". */
export function formatMoneyCompact(amount: number, currency: 'TRY' | 'EUR' | 'USD' = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
/** Saniye → "5 dk 12 sn" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} sn`;
  return s === 0 ? `${m} dk` : `${m} dk ${s} sn`;
}
/** Hash kısaltma: ilk 4 … son 4 (kanıt dili). */
export function shortHash(h: string): string {
  return h.length <= 12 ? h : `${h.slice(0, 4)}…${h.slice(-4)}`;
}
/** Göreli zaman: "4 gün önce" */
export function formatRelative(d: Date | string): string {
  const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
  const diff = Math.round((Date.now() - t) / 1000);
  const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return rtf.format(-diff, 'second');
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}
