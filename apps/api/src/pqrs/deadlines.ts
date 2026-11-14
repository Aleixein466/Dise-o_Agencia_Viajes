// PQRS response deadlines. Business days are counted in Colombia's time zone (UTC-5, no DST), starting the day
// after filing. Which term applies to each PQRS type and whether holidays are excluded are LEGAL decisions:
// everything here is configuration, defaults are conservative and documented in docs/operations/PQRS_PLAZOS.md.

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

/** Moves a date to the following Monday unless it already is one (Ley 51 de 1983, "Ley Emiliani"). */
const nextMonday = (date: Date) => addDays(date, (8 - date.getUTCDay()) % 7);

/**
 * National holidays of Colombia (Ley 51 de 1983 and Ley 35 de 1939). Extraordinary holidays decreed by the
 * Government are not predictable: add them with PQRS_EXTRA_HOLIDAYS.
 */
export function colombianHolidays(year: number): string[] {
  const easter = easterSunday(year);
  const fixed = [
    utcDate(year, 1, 1),
    utcDate(year, 5, 1),
    utcDate(year, 7, 20),
    utcDate(year, 8, 7),
    utcDate(year, 12, 8),
    utcDate(year, 12, 25),
  ];
  const moved = [
    utcDate(year, 1, 6),
    utcDate(year, 3, 19),
    utcDate(year, 6, 29),
    utcDate(year, 8, 15),
    utcDate(year, 10, 12),
    utcDate(year, 11, 1),
    utcDate(year, 11, 11),
  ].map(nextMonday);
  const easterBased = [
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    nextMonday(addDays(easter, 39)), // Ascensión
    nextMonday(addDays(easter, 60)), // Corpus Christi
    nextMonday(addDays(easter, 68)), // Sagrado Corazón
  ];
  return [...fixed, ...moved, ...easterBased].map(iso).sort();
}

export type PqrsType = "PETITION" | "COMPLAINT" | "CLAIM" | "SUGGESTION";
export type DeadlineConfig = {
  defaultDays: number;
  daysByType: Partial<Record<PqrsType, number>>;
  /** "none": weekends only. "colombia": weekends + national holidays + extra dates. */
  holidays: "none" | "colombia";
  extraHolidays: string[];
};

/** "PETITION=15,CLAIM=15" → { PETITION: 15, CLAIM: 15 }. Invalid entries throw at startup (env validation). */
export function parseDaysByType(raw: string): Partial<Record<PqrsType, number>> {
  const out: Partial<Record<PqrsType, number>> = {};
  for (const part of raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const match = /^(PETITION|COMPLAINT|CLAIM|SUGGESTION)=(\d{1,2})$/.exec(part);
    const days = match ? Number(match[2]) : NaN;
    if (!match || days < 1 || days > 30) throw new Error(`Invalid PQRS_RESPONSE_DAYS_BY_TYPE entry: ${part}`);
    out[match[1] as PqrsType] = days;
  }
  return out;
}

export function parseHolidayList(raw: string): string[] {
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const day of list)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || iso(new Date(`${day}T00:00:00Z`)) !== day)
      throw new Error(`Invalid PQRS_EXTRA_HOLIDAYS date: ${day}`);
  return list;
}

/** Adds N business days counted in Bogotá local dates; the time of day of `from` is preserved. */
export function addBusinessDays(from: Date, days: number, isHoliday: (isoDate: string) => boolean = () => false): Date {
  let local = new Date(from.getTime() + BOGOTA_OFFSET_MS);
  let left = days;
  while (left > 0) {
    local = addDays(local, 1);
    const weekday = local.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !isHoliday(iso(local))) left -= 1;
  }
  return new Date(local.getTime() - BOGOTA_OFFSET_MS);
}

export function responseDueAt(config: DeadlineConfig, type: PqrsType, from: Date): Date {
  const days = config.daysByType[type] ?? config.defaultDays;
  const extra = new Set(config.extraHolidays);
  const byYear = new Map<number, Set<string>>();
  const isHoliday = (day: string) => {
    if (extra.has(day)) return true;
    if (config.holidays !== "colombia") return false;
    const year = Number(day.slice(0, 4));
    if (!byYear.has(year)) byYear.set(year, new Set(colombianHolidays(year)));
    return byYear.get(year)!.has(day);
  };
  return addBusinessDays(from, days, isHoliday);
}
