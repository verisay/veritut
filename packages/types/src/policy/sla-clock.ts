/**
 * SLA saati (plan §8.2) — K4'te olay servisine bağlanır; çekirdek hesap burada test edilir.
 * Kapsam: `9x5` iş günü 09:00–18:00 Europe/Istanbul + resmî tatiller; `24x7` sürekli.
 */
export type SlaCoverage = '9x5' | '24x7';

export interface SlaTier {
  code: string;
  coverage: SlaCoverage;
  responseMin: number;
  resolveMin: number;
  uptimeTarget: number;
}

const BUSINESS_START = 9;
const BUSINESS_END = 18;

/** İstanbul yerel saatine göre gün/saat bileşenleri — DST yok (TR sabit +03:00). */
function istanbul(d: Date): { dow: number; hour: number; minute: number; ymd: string } {
  const shifted = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return {
    dow: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    ymd: shifted.toISOString().slice(0, 10),
  };
}

export function isBusinessMoment(d: Date, holidays: ReadonlySet<string>): boolean {
  const t = istanbul(d);
  if (t.dow === 0 || t.dow === 6) return false;
  if (holidays.has(t.ymd)) return false;
  return t.hour >= BUSINESS_START && t.hour < BUSINESS_END;
}

/**
 * `from` anından itibaren `minutes` kadar SLA-dakikası ilerletir.
 * 24x7'de düz toplama; 9x5'te yalnız iş saatleri sayılır (dakika adımlı, yeterince hızlı).
 */
export function addSlaMinutes(from: Date, minutes: number, coverage: SlaCoverage, holidays: ReadonlySet<string>): Date {
  if (coverage === '24x7') return new Date(from.getTime() + minutes * 60_000);
  let cursor = new Date(from.getTime());
  let left = minutes;
  // Güvenlik sınırı: 400 gün — sonsuz döngüye karşı.
  const hardStop = from.getTime() + 400 * 24 * 60 * 60_000;
  while (left > 0 && cursor.getTime() < hardStop) {
    if (isBusinessMoment(cursor, holidays)) left -= 1;
    cursor = new Date(cursor.getTime() + 60_000);
  }
  return cursor;
}

/** TR resmî tatilleri (sabit tarihli olanlar); dini bayramlar `business_calendar` tablosundan seed'lenir. */
export const TR_FIXED_HOLIDAYS = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'] as const;

export function fixedHolidaysForYear(year: number): string[] {
  return TR_FIXED_HOLIDAYS.map((md) => `${year}-${md}`);
}
