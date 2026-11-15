import { parseText } from "./metadata.ts";
import type { ParseWarningHandler, TodoRecord } from "./types.ts";

const PRIORITY_PATTERN = /^\(([A-Z])\) /;
const LEADING_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?: |$)/;

/**
 * Consume a `YYYY-MM-DD` date from the start of `input`.
 *
 * Only the shape is validated; the date does not have to exist on a calendar
 * (matching the literal format rules).
 */
function takeLeadingDate(input: string): [date: string | null, rest: string] {
  const match = LEADING_DATE_PATTERN.exec(input);
  if (!match) {
    return [null, input];
  }

  const date = match[1];
  if (date === undefined) {
    return [null, input];
  }

  return [date, input.slice(match[0]!.length)];
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
    [completedAt, rest] = takeLeadingDate(rest);
    [createdAt, rest] = takeLeadingDate(rest);
  } else {
    const priorityMatch = PRIORITY_PATTERN.exec(rest);
    if (priorityMatch) {
      priority = priorityMatch[1]!;
      rest = rest.slice(priorityMatch[0]!.length);
    }

    [createdAt, rest] = takeLeadingDate(rest);
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
