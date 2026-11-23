import type { TodoRecord } from "./types.ts";

/** Copy a record so callers cannot mutate the client's cached snapshot. */
export function cloneRecord<TData extends Record<string, string>>(
  todo: TodoRecord<TData>,
): TodoRecord<TData> {
  const copy: TodoRecord<TData> = {
    completed: todo.completed,
    priority: todo.priority,
    completedAt: todo.completedAt,
    createdAt: todo.createdAt,
    description: todo.description,
    projects: [...todo.projects],
    contexts: [...todo.contexts],
    data: { ...todo.data },
  };

  if (todo.line !== undefined) {
    copy.line = todo.line;
  }

  if (todo.raw !== undefined) {
    copy.raw = todo.raw;
  }

  return copy;
}

/** Copy every record in `records`. */
export function cloneRecords<TData extends Record<string, string>>(
  records: readonly TodoRecord<TData>[],
): TodoRecord<TData>[] {
  return records.map(cloneRecord<TData>);
}

/**
 * Which source fields public record copies carry.
 *
 * The client's internal records always track their source line and raw
 * line; this policy decides what consumer-facing copies expose.
 */
export interface SourceExposure {
  /** Keep the 1-based source `line` on public copies. */
  includeLine: boolean;
  /** Keep the exact `raw` source line on public copies. */
  includeRaw: boolean;
}

/**
 * Copy a record for exposure to consumers, keeping source fields only when
 * the policy allows.
 *
 * Consumers never see source data they did not opt into (`raw` needs
 * `includeSource`), and write-enabled clients expose `line` because their
 * write APIs locate records by it.
 */
export function publicRecord<TData extends Record<string, string>>(
  todo: TodoRecord<TData>,
  exposure: SourceExposure,
): TodoRecord<TData> {
  const copy: TodoRecord<TData> = {
    completed: todo.completed,
    priority: todo.priority,
    completedAt: todo.completedAt,
    createdAt: todo.createdAt,
    description: todo.description,
    projects: [...todo.projects],
    contexts: [...todo.contexts],
    data: { ...todo.data },
  };

  if (exposure.includeLine && todo.line !== undefined) {
    copy.line = todo.line;
  }

  if (exposure.includeRaw && todo.raw !== undefined) {
    copy.raw = todo.raw;
  }

  return copy;
}

/** Copy every record for exposure with the same policy. */
export function publicRecords<TData extends Record<string, string>>(
  records: readonly TodoRecord<TData>[],
  exposure: SourceExposure,
): TodoRecord<TData>[] {
  return records.map((record) => publicRecord(record, exposure));
}
