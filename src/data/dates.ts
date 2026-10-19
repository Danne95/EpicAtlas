export interface DatePeriod { start: string; end: string; }
export interface DateRange { start?: string; end?: string; includeUndated: boolean; }

/** Calendar periods, independent of timezone and JavaScript's permissive date parser. */
export function datePeriod(value?: string): DatePeriod | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value?.trim() || '');
  if (!match) return undefined;
  const year = Number(match[1]), month = match[2] ? Number(match[2]) : undefined;
  if (year < 1 || (month !== undefined && (month < 1 || month > 12))) return undefined;
  if (month === undefined) return { start: `${match[1]}-01-01`, end: `${match[1]}-12-31` };
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!match[3]) return { start: `${match[1]}-${match[2]}-01`, end: `${match[1]}-${match[2]}-${days}` };
  const day = Number(match[3]);
  if (day < 1 || day > days) return undefined;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return { start: date, end: date };
}

export function matchesDate(value: string | undefined, range: DateRange): boolean {
  const period = datePeriod(value);
  if (!period) return range.includeUndated;
  return (!range.start || period.end >= range.start) && (!range.end || period.start <= range.end);
}
