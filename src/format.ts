import type { TodoRecord } from "./types.ts";

/**
 * Options for {@link formatRecord}, also accepted by
 * {@link formatDocument}.
 */
export interface TodoFormatOptions {
  /** Emit `+project` tags. Default: `true`. */
  includeProjects?: boolean;
  /** Emit `@context` tags. Default: `true`. */
  includeContexts?: boolean;
  /** Emit `key:value` metadata tags. Default: `true`. */
  includeMetadata?: boolean;
}

/**
 * Options for {@link formatDocument}.
 *
 * Extends {@link TodoFormatOptions} with the line separator, and every
 * `include*` flag applies to every record in the document.
 */
export interface TodoDocumentFormatOptions extends TodoFormatOptions {
  /**
   * Line separator, also written once after the last record. `"\r"` joins
   * lines with classic-Mac carriage returns, mirroring the line endings the
   * parser accepts. Default: `"\n"`.
   */
  eol?: "\n" | "\r" | "\r\n";
}

interface ResolvedTodoFormatOptions {
  includeProjects: boolean;
  includeContexts: boolean;
  includeMetadata: boolean;
}

function resolveFormatOptions(
  options?: TodoFormatOptions,
): ResolvedTodoFormatOptions {
  return {
    includeProjects: options?.includeProjects ?? true,
    includeContexts: options?.includeContexts ?? true,
    includeMetadata: options?.includeMetadata ?? true,
  };
}

/**
 * Compare `[key, value]` entries by key, so metadata tags emit in a
 * normalized order instead of insertion order.
 */
function compareEntries(
  a: [string, string],
  b: [string, string],
): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

function formatRecordCore<TData extends Record<string, string>>(
  todo: TodoRecord<TData>,
  options: ResolvedTodoFormatOptions,
): string {
  const parts: string[] = [];

  if (todo.completed) {
    parts.push("x");
  }

  if (todo.completedAt !== null) {
    parts.push(todo.completedAt);
  }

  if (todo.priority !== null) {
    parts.push(`(${todo.priority})`);
  }

  if (todo.createdAt !== null) {
    parts.push(todo.createdAt);
  }

  if (todo.description !== "") {
    parts.push(todo.description);
  }

  if (options.includeProjects) {
    for (const project of [...todo.projects].sort()) {
      parts.push(`+${project}`);
    }
  }

  if (options.includeContexts) {
    for (const context of [...todo.contexts].sort()) {
      parts.push(`@${context}`);
    }
  }

  if (options.includeMetadata) {
    for (const [key, value] of Object.entries(todo.data).sort(compareEntries)) {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join(" ");
}

/**
 * Format a record as one canonical todo.txt line.
 *
 * The output order is: the `x` completion marker, the completion date, the
 * priority, the creation date, the description, then `+project`, `@context`,
 * and `key:value` tags. Projects, contexts, and metadata keys are all
 * alphabetized, so two records with the same fields format to the same
 * string. Values are emitted as stored; a `key:` with an empty value stays
 * empty.
 *
 * This is canonical, not lossless. The parser strips tags out of
 * `description`, so tags always reappear after the task text rather than at
 * their original positions, and any extra spacing from the source line is
 * gone. The parser also never keeps a priority on a completed record, so
 * only a hand-built or mutated record can produce `x DATE (A) ...` output.
 * Source fields are ignored: `formatRecord` always formats from the record
 * fields, even when `raw` is present, so a mutated record never formats to
 * stale text. Use the exact source line instead when you have it:
 *
 * ```ts
 * const line = todo.raw ?? formatRecord(todo);
 * ```
 *
 * `TData` types the record's `data` metadata; see {@link TodoRecord}.
 */
export function formatRecord<
  TData extends Record<string, string> = Record<string, string>,
>(todo: TodoRecord<TData>, options?: TodoFormatOptions): string {
  return formatRecordCore(todo, resolveFormatOptions(options));
}

/**
 * Format records as a whole todo.txt document.
 *
 * Each record is formatted by {@link formatRecord} with the same
 * `include*` options, the lines are joined with `eol` (default `"\n"`), and
 * the result ends with a single trailing `eol`. An empty `records` array
 * formats to `""`, with no trailing separator. A record whose fields are
 * all empty formats to an empty line, exactly like a blank source line.
 *
 * `TData` types the records' `data` metadata; see {@link TodoRecord}.
 */
export function formatDocument<
  TData extends Record<string, string> = Record<string, string>,
>(
  records: readonly TodoRecord<TData>[],
  options?: TodoDocumentFormatOptions,
): string {
  const { eol = "\n", ...recordOptions } = options ?? {};

  if (records.length === 0) {
    return "";
  }

  const lines = records.map((record) => formatRecord(record, recordOptions));
  return `${lines.join(eol)}${eol}`;
}
