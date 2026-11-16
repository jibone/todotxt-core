import { isValidDate } from "./date.ts";
import { parseText } from "./metadata.ts";
import type { ParseWarningHandler, TodoRecord } from "./types.ts";

const PRIORITY_PATTERN = /^\(([A-Z])\) /;
const LEADING_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?: |$)/;

type LeadingDate =
  | { kind: "absent"; rest: string }
  | { kind: "valid"; date: string; rest: string }
  | { kind: "invalid"; value: string; rest: string };

/**
 * Inspect a `YYYY-MM-DD` token at the start of `input`.
 *
 * A value with the right shape that does not exist on the calendar is reported
 * as `invalid`. In that case `rest` is the original input, so callers leave the
 * token in the description instead of consuming it.
 */
function takeLeadingDate(input: string): LeadingDate {
  const match = LEADING_DATE_PATTERN.exec(input);
  if (!match) {
    return { kind: "absent", rest: input };
  }

  const date = match[1];
  if (date === undefined) {
    return { kind: "absent", rest: input };
  }

  if (!isValidDate(date)) {
    return { kind: "invalid", value: date, rest: input };
  }

  return { kind: "valid", date, rest: input.slice(match[0]!.length) };
}

function warnInvalidDate(
  value: string,
  field: "completedAt" | "createdAt",
  onWarning?: ParseWarningHandler,
): void {
  const label = field === "completedAt" ? "completion" : "creation";

  onWarning?.({
    code: "invalid-date",
    message: `Invalid ${label} date "${value}"; treating it as text.`,
    meta: { value, field },
  });
}

/**
 * Parse a single todo.txt line directly into a JSON-friendly {@link TodoRecord}.
 *
 * The parser follows the todo.txt format rules:
 *
 * - Completed tasks start with `x `, optionally followed by a completion date
 *   and then a creation date.
 * - Incomplete tasks may start with an `(A)`–`(Z)` priority and an optional
 *   creation date.
 * - Dates must be real calendar dates in `YYYY-MM-DD` form. A shape-valid but
 *   nonexistent date is treated as text.
 * - Projects, contexts, and `key:value` metadata may appear anywhere in the
 *   remaining text.
 *
 * Recoverable issues are reported to `onWarning` when supplied; parsing still
 * produces a record.
 */
export function parseLine(
  line: string,
  onWarning?: ParseWarningHandler,
): TodoRecord {
  let rest = line;
  let completed = false;
  let priority: string | null = null;
  let completedAt: string | null = null;
  let createdAt: string | null = null;

  if (rest.startsWith("x ")) {
    completed = true;
    rest = rest.slice(2);

    const completedDate = takeLeadingDate(rest);
    if (completedDate.kind === "valid") {
      completedAt = completedDate.date;
      rest = completedDate.rest;

      const createdDate = takeLeadingDate(rest);
      if (createdDate.kind === "valid") {
        createdAt = createdDate.date;
        rest = createdDate.rest;
      } else if (createdDate.kind === "invalid") {
        warnInvalidDate(createdDate.value, "createdAt", onWarning);
      }
    } else if (completedDate.kind === "invalid") {
      // The same token cannot also be a creation date, so only warn once.
      warnInvalidDate(completedDate.value, "completedAt", onWarning);
    }
  } else {
    const priorityMatch = PRIORITY_PATTERN.exec(rest);
    if (priorityMatch) {
      priority = priorityMatch[1]!;
      rest = rest.slice(priorityMatch[0]!.length);
    }

    const createdDate = takeLeadingDate(rest);
    if (createdDate.kind === "valid") {
      createdAt = createdDate.date;
      rest = createdDate.rest;
    } else if (createdDate.kind === "invalid") {
      warnInvalidDate(createdDate.value, "createdAt", onWarning);
    }
  }

  const text = rest.trim();
  const { description, projects, contexts, data } = parseText(text, onWarning);

  return {
    completed,
    priority,
    completedAt,
    createdAt,
    description,
    projects,
    contexts,
    data,
  };
}

/**
 * Parse the contents of a todo.txt file.
 *
 * Lines are split on `\n` or `\r\n`; blank and whitespace-only lines are
 * skipped. Every remaining line becomes a {@link TodoRecord}. Warnings are
 * annotated with the 1-based physical line number.
 */
export function parseDocument(
  contents: string,
  onWarning?: ParseWarningHandler,
): TodoRecord[] {
  const records: TodoRecord[] = [];
  let lineNumber = 0;

  for (const line of contents.split(/\r?\n/)) {
    lineNumber += 1;

    if (line.trim() !== "") {
      records.push(
        parseLine(
          line,
          onWarning
            ? (warning) => onWarning({ ...warning, line: lineNumber })
            : undefined,
        ),
      );
    }
  }

  return records;
}
