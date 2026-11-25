const DATE_SHAPE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Days in `month` (1-12) of `year`, with February leap-aware.
 *
 * Returns `0` for an out-of-range month, so callers that validate the month
 * first can branch on the result alone. Exported for `src/ext.ts`'s window
 * arithmetic; not part of the public core entry.
 */
export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year)
    ? 29
    : (DAYS_IN_MONTH[month - 1] ?? 0);
}

/**
 * True when `value` is a real calendar date in `YYYY-MM-DD` form.
 *
 * The check is purely arithmetic so it does not depend on the host timezone and
 * does not let JavaScript's `Date` roll invalid values over (for example,
 * `2011-02-30` must not become March 2).
 */
export function isValidDate(value: string): boolean {
  const match = DATE_SHAPE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= daysInMonth(year, month);
}

/**
 * Today's date on the system clock, as `YYYY-MM-DD`.
 *
 * Reads the local calendar fields rather than `toISOString()`, which would
 * report the UTC date and drift near midnight, and zero-pads each part.
 */
export function localToday(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
