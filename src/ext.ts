import { daysInMonth, isValidDate } from "./date.ts";
import type { TodoRecord } from "./types.ts";

/**
 * Helpers for the `due:` and `pri:` extension-tag conventions, shipped as
 * the optional `@jibone/todotxt-core/ext` subpath.
 *
 * Extension tags are tool conventions, not part of the todo.txt format
 * proper — the format defines exactly two dates, creation and completion,
 * and both have first-class core support. What a `due:` or a `pri:` means
 * is application policy, so the core entry stays key-agnostic; this subpath
 * is that policy, versioned and tested, for consumers who would otherwise
 * copy the README recipes.
 *
 * The helpers are opt-in imports, never reachable from the core entry, and
 * add no runtime dependency the core does not already use.
 *
 * Every date helper takes `today` explicitly: nothing here reads the clock,
 * a locale, or a timezone, so behavior is deterministic in tests. Records
 * are never mutated, and a `due:` that is missing, inherited, or not a real
 * `YYYY-MM-DD` date is ignored rather than thrown. Only caller mistakes
 * are loud: a `today` that is not a real date, or a `days` that is not a
 * non-negative integer, throws a `TypeError`.
 */

/**
 * The `due:` convention value when it is a real calendar date, else `null`.
 *
 * Completion is irrelevant to the read: a completed record still reports
 * its `due:`. An inherited `due` key — a prototype property, not the
 * record's own — is ignored, matching the parser's `Object.hasOwn` reads.
 */
export function dueDate(todo: TodoRecord): string | null {
  if (!Object.hasOwn(todo.data, "due")) {
    return null;
  }

  const due = todo.data["due"];
  return due !== undefined && isValidDate(due) ? due : null;
}

/**
 * The effective priority: the record's own priority, else the `pri:`
 * convention, else `null`.
 *
 * The record's priority is dropped on completion, and the todo.txt
 * community records the pre-completion priority as `pri:` metadata (for
 * example `x 2024-01-12 Publish v0.1 pri:A`); this reader surfaces it for
 * exactly that case. The `pri:` value is returned as-is, with no shape
 * check, and completion is irrelevant to the read.
 */
export function effectivePriority(todo: TodoRecord): string | null {
  if (todo.priority !== null) {
    return todo.priority;
  }

  if (!Object.hasOwn(todo.data, "pri")) {
    return null;
  }

  const pri = todo.data["pri"];
  return pri !== undefined ? pri : null;
}

/**
 * Guard the caller-supplied `today` argument shared by the predicates.
 *
 * Data quirks are the record's business and stay ignored; an unusable
 * argument is the caller's business and throws.
 */
function requireToday(method: string, today: string): void {
  if (!isValidDate(today)) {
    throw new TypeError(
      `${method}() expected today to be a real YYYY-MM-DD date, got ${JSON.stringify(today)}.`,
    );
  }
}

/**
 * True when a pending record has a `due:` date strictly before `today`.
 *
 * A completed record is never overdue. Validated `YYYY-MM-DD` values
 * compare correctly as plain strings, so no date arithmetic is involved.
 */
export function isOverdue(todo: TodoRecord, today: string): boolean {
  requireToday("isOverdue", today);

  const due = dueDate(todo);
  return !todo.completed && due !== null && due < today;
}

/**
 * True when a pending record is due exactly on `today`.
 *
 * A completed record is never due, even when its `due:` matches.
 */
export function isDueToday(todo: TodoRecord, today: string): boolean {
  requireToday("isDueToday", today);

  const due = dueDate(todo);
  return !todo.completed && due === today;
}

/**
 * True when a pending record's `due:` falls in the inclusive forward window
 * `[today, today + days]`; `days` of `0` is exactly {@link isDueToday}.
 *
 * Overdue records are deliberately excluded so the three predicates never
 * overlap; an agenda that also wants the backlog composes them:
 *
 * ```ts
 * todos.filter((todo) => isOverdue(todo, today) || isDueWithin(todo, 7, today));
 * ```
 *
 * `days` must be a non-negative integer. The window end is computed with
 * leap-year-aware arithmetic — no `Date`, so no clock, timezone, or
 * out-of-range rollover is possible.
 */
export function isDueWithin(
  todo: TodoRecord,
  days: number,
  today: string,
): boolean {
  requireToday("isDueWithin", today);

  if (!Number.isInteger(days) || days < 0) {
    throw new TypeError(
      `isDueWithin() expected days to be a non-negative integer, got ${days}.`,
    );
  }

  const due = dueDate(todo);
  if (todo.completed || due === null || due < today) {
    return false;
  }

  // Compare calendar parts numerically: a window long enough to push the
  // end year past 9999 would otherwise format to a five-digit year whose
  // string form no longer compares with `due`'s four digits.
  const [endYear, endMonth, endDay] = addDays(today, days);
  const dueYear = Number(due.slice(0, 4));
  const dueMonth = Number(due.slice(5, 7));
  const dueDay = Number(due.slice(8, 10));

  return (
    dueYear < endYear ||
    (dueYear === endYear &&
      (dueMonth < endMonth || (dueMonth === endMonth && dueDay <= endDay)))
  );
}

/**
 * `date` plus `days`, as calendar parts `[year, month, day]`.
 *
 * Walks month boundaries with leap-year knowledge instead of using `Date`,
 * which cannot read a clock or timezone here and cannot roll out-of-range
 * parts. `date` must already be a validated `YYYY-MM-DD` value and `days` a
 * non-negative integer; the callers check both.
 *
 * The parts are returned rather than a formatted string so the caller can
 * compare numerically: a window long enough to push the year past 9999
 * would produce a five-digit year whose string form no longer compares
 * lexicographically with four-digit dates.
 */
function addDays(date: string, days: number): [number, number, number] {
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7));
  let day = Number(date.slice(8, 10)) + days;

  let monthDays = daysInMonth(year, month);
  while (day > monthDays) {
    day -= monthDays;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    monthDays = daysInMonth(year, month);
  }

  return [year, month, day];
}
