import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const CET_TIMEZONE = 'Europe/Amsterdam'; // CET/CEST

/**
 * Parse a UTC date string and convert to CET timezone
 * Use this when you need a Date object for calculations (e.g., differenceInDays)
 */
export function parseDateCET(dateString: string): Date {
  const utcDate = new Date(dateString);
  return toZonedTime(utcDate, CET_TIMEZONE);
}

/**
 * Format a date string displaying in CET timezone
 * Use this for direct display formatting
 */
export function formatDateCET(dateString: string, formatStr: string = 'MMM d, yyyy'): string {
  return formatInTimeZone(new Date(dateString), CET_TIMEZONE, formatStr);
}
