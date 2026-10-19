import type { TodoItem } from "./types.ts";

const PRIORITY_PATTERN = /^\(([A-Z])\) /;
const LEADING_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?: |$)/;
const EXTENSION_PATTERN = /^([^:\s]+):([^:\s]+)$/;

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

function parseMetadata(text: string): Pick<
  TodoItem,
  "projects" | "contexts" | "extensions"
> {
  const projects: string[] = [];
  const contexts: string[] = [];
  const extensions: Record<string, string> = {};

  for (const token of text.split(/\s+/)) {
    if (token.startsWith("+") && token.length > 1) {
      projects.push(token.slice(1));
      continue;
    }

    if (token.startsWith("@") && token.length > 1) {
      contexts.push(token.slice(1));
      continue;
    }

    const extension = EXTENSION_PATTERN.exec(token);
    const key = extension?.[1];
    const value = extension?.[2];
    if (key !== undefined && value !== undefined) {
      extensions[key] = value;
    }
  }

  return { projects, contexts, extensions };
}

/**
 * Parse a single todo.txt line.
 *
 * The parser follows the todo.txt format rules:
 *
 * - Completed tasks start with `x `, optionally followed by a completion date
 *   and then a creation date.
 * - Incomplete tasks may start with an `(A)`–`(Z)` priority and an optional
 *   creation date.
 * - Projects, contexts, and `key:value` metadata may appear anywhere in the
 *   remaining text.
 */
export function parseLine(line: string): TodoItem {
  let rest = line;
  let completed = false;
  let priority: string | null = null;
  let completionDate: string | null = null;
  let creationDate: string | null = null;

  if (rest.startsWith("x ")) {
    completed = true;
    rest = rest.slice(2);
    [completionDate, rest] = takeLeadingDate(rest);
    [creationDate, rest] = takeLeadingDate(rest);
  } else {
    const priorityMatch = PRIORITY_PATTERN.exec(rest);
    if (priorityMatch) {
      priority = priorityMatch[1]!;
      rest = rest.slice(priorityMatch[0]!.length);
    }

    [creationDate, rest] = takeLeadingDate(rest);
  }

  const text = rest.trim();
  const metadata = parseMetadata(text);

  return {
    raw: line,
    completed,
    priority,
    completionDate,
    creationDate,
    text,
    ...metadata,
  };
}

/**
 * Parse the contents of a todo.txt file.
 *
 * Lines are split on `\n` or `\r\n`; blank and whitespace-only lines are
 * skipped.
 */
export function parseDocument(contents: string): TodoItem[] {
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(parseLine);
}
