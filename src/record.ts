import { stripMetadata } from "./metadata.ts";
import type { TodoItem, TodoRecord } from "./types.ts";

/** Convert a parsed {@link TodoItem} into a JSON-friendly {@link TodoRecord}. */
export function toTodoRecord(item: TodoItem): TodoRecord {
  return {
    completed: item.completed,
    priority: item.priority,
    completedAt: item.completionDate,
    createdAt: item.creationDate,
    description: stripMetadata(item.text),
    projects: item.projects,
    contexts: item.contexts,
    data: item.extensions,
  };
}
