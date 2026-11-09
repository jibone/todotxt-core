import type { TodoRecord } from "./types.ts";

/** Copy a record so callers cannot mutate the client's cached snapshot. */
export function cloneRecord(todo: TodoRecord): TodoRecord {
  return {
    completed: todo.completed,
    priority: todo.priority,
    completedAt: todo.completedAt,
    createdAt: todo.createdAt,
    description: todo.description,
    projects: [...todo.projects],
    contexts: [...todo.contexts],
    data: { ...todo.data },
  };
}

/** Copy every record in `records`. */
export function cloneRecords(records: readonly TodoRecord[]): TodoRecord[] {
  return records.map(cloneRecord);
}
