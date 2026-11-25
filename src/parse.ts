import { isValidDate } from "./date.ts";
import { parseText } from "./metadata.ts";
import type {
  ParseOptions,
  ParseResult,
  ParseWarning,
  ParseWarningHandler,
  TodoRecord,
} from "./types.ts";

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

/** Remove one trailing `\r`, so `raw` has no carriage return for CRLF input. */
function stripTrailingCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Remove one leading UTF-8 byte-order mark (U+FEFF).
 *
 * Editors often write a BOM at the start of a file, and it would otherwise
 * defeat the priority and date prefix checks on the first line. `raw` is
 * built from the caller's original line, so it keeps the mark.
 */
function stripLeadingBom(line: string): string {
  return line.startsWith("\uFEFF") ? line.slice(1) : line;
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
 * Recoverable issues are reported to `options.onWarning` when supplied;
 * parsing still produces a record.
 *
 * One leading byte-order mark (U+FEFF) is dropped before the prefix checks,
 * so a BOM saved by an editor cannot hide the priority or dates. The mark
 * is kept in `raw`.
 *
 * With `options.includeSource`, the record carries `raw` (the exact input
 * line, minus a trailing `\r`, with a leading byte-order mark kept) and
 * `line` (the number supplied via `options.line`, when given).
 */
export function parseLine(
  line: string,
  options?: ParseOptions,
): TodoRecord {
  const { includeSource, onWarning } = options ?? {};
  let rest = stripLeadingBom(line);
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
  const { description, projects, contexts, data } = parseText(
    text,
    onWarning,
  );

  const record: TodoRecord = {
    completed,
    priority,
    completedAt,
    createdAt,
    description,
    projects,
    contexts,
    data,
  };

  if (includeSource) {
    if (options?.line !== undefined) {
      record.line = options.line;
    }

    record.raw = stripTrailingCarriageReturn(line);
  }

  return record;
}

/**
 * Shared document parser behind {@link parseDocument} and
 * {@link parseDocumentResult}.
 *
 * Warnings are always collected, in document order and annotated with their
 * 1-based physical line number, and forwarded to the consumer's `onWarning`
 * when one is supplied. A single trailing `\n` or lone `\r` ends the last
 * line rather than starting an empty one, so it adds neither a line nor a
 * skipped line.
 */
function parseDocumentCore(
  contents: string,
  options: ParseOptions,
): ParseResult {
  const { includeSource, onWarning } = options;
  const segments = contents.split(/\r\n|\n|\r/);
  const lines =
    contents === ""
      ? []
      : contents.endsWith("\n") || contents.endsWith("\r")
        ? segments.slice(0, -1)
        : segments;

  const records: TodoRecord[] = [];
  const warnings: ParseWarning[] = [];
  let skippedLines = 0;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;

    if (line.trim() === "") {
      skippedLines += 1;
      continue;
    }

    records.push(
      parseLine(line, {
        includeSource,
        line: lineNumber,
        onWarning: (warning) => {
          const annotated = { ...warning, line: lineNumber };
          warnings.push(annotated);
          onWarning?.(annotated);
        },
      }),
    );
  }

  return { records, warnings, lineCount: lines.length, skippedLines };
}

/**
 * Parse the contents of a todo.txt file.
 *
 * Lines are split on `\n`, `\r\n`, or a lone `\r`; blank and whitespace-only
 * lines are skipped. Every remaining line becomes a {@link TodoRecord}.
 * Warnings are annotated with the 1-based physical line number.
 *
 * With `options.includeSource`, every record carries `raw` (the exact line,
 * minus a trailing `\r`) and `line` (the 1-based physical line number,
 * counting blank lines).
 */
export function parseDocument(
  contents: string,
  options?: ParseOptions,
): TodoRecord[] {
  return parseDocumentCore(contents, options ?? {}).records;
}

/**
 * Parse the contents of a todo.txt file, returning records, warnings, and
 * line counts as data.
 *
 * The records are exactly what {@link parseDocument} returns. The
 * {@link ParseResult} additionally carries every warning in document order
 * (annotated with the 1-based physical line number), the number of physical
 * lines, and how many of them were blank or whitespace-only. A single
 * trailing `\n` or lone `\r` ends the last line rather than starting an
 * empty one, and the empty input has no lines.
 *
 * Warnings are also forwarded to `options.onWarning` when supplied, so this
 * composes with existing warning handling.
 */
export function parseDocumentResult(
  contents: string,
  options?: ParseOptions,
): ParseResult {
  return parseDocumentCore(contents, options ?? {});
}
