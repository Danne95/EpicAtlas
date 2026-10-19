import { datePeriod, type DateRange } from './dates';

/** Event boundaries avoid spending playback time on years with no travel. */
export function chronologyFrames(dates: (string | undefined)[], range: DateRange): string[] {
  const periods = dates.map(datePeriod).filter((period) => period !== undefined)
    .filter((period) => (!range.start || period.end >= range.start) && (!range.end || period.start <= range.end));
  if (!periods.length) return [];
  const first = range.start || periods.reduce((value, period) => period.start < value ? period.start : value, periods[0].start);
  const last = range.end || periods.reduce((value, period) => period.end > value ? period.end : value, periods[0].end);
  return [...new Set([first, ...periods.map((period) => period.start < first ? first : period.start), last])].sort();
}
