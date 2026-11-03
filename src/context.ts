import { toTodoRecord } from "./record.ts";
import type { ProjectListQuery, ProjectTasksQuery } from "./project.ts";
import type { TodoItem, TodoRecord } from "./types.ts";

/** Status filter accepted by the context query builders. */
export type ContextStatus = "pending" | "completed";

/**
 * A lazy query over context names.
 *
 * Awaiting the query reads the todo.txt contents and resolves to the matching
 * names. Chain {@link ContextListQuery.pending} or
 * {@link ContextListQuery.completed} to filter; the most recent call wins.
 */
export interface ContextListQuery extends PromiseLike<string[]> {
  /** Only contexts that have at least one unfinished item. */
  pending: () => ContextListQuery;
  /** Only contexts whose items are all completed. */
  completed: () => ContextListQuery;
}

/**
 * A lazy query over the items in a single context.
 *
 * Awaiting the query reads the todo.txt contents and resolves to matching
 * {@link TodoRecord}s in file order. Chain {@link ContextTasksQuery.pending}
 * or {@link ContextTasksQuery.completed} to filter; the most recent call wins.
 */
export interface ContextTasksQuery extends PromiseLike<TodoRecord[]> {
  /** Only items from the context that are not completed. */
  pending: () => ContextTasksQuery;
  /** Only items from the context that are completed. */
  completed: () => ContextTasksQuery;
  /** List the projects used by items in this context, alphabetically sorted. */
  projects: () => ProjectListQuery;
  /** Narrow this context query to items that also carry `name`. */
  project: (name: string) => ProjectTasksQuery;
}

function matchesStatus(
  completed: boolean,
  status: ContextStatus | undefined,
): boolean {
  if (status === undefined) {
    return true;
  }

  return status === "completed" ? completed : !completed;
}

/**
 * Collect unique context names, alphabetically sorted.
 *
 * When `status` is `"pending"`, only contexts with at least one unfinished
 * item are returned. When `status` is `"completed"`, only contexts whose items
 * are all completed are returned. A context with a mix of both is therefore
 * considered pending.
 */
export function listContexts(
  items: TodoItem[],
  status?: ContextStatus,
): string[] {
  const hasPending = new Map<string, boolean>();

  for (const item of items) {
    for (const name of item.contexts) {
      hasPending.set(name, (hasPending.get(name) ?? false) || !item.completed);
    }
  }

  const names: string[] = [];
  for (const [name, pending] of hasPending) {
    if (status === "pending" && !pending) {
      continue;
    }

    if (status === "completed" && pending) {
      continue;
    }

    names.push(name);
  }

  return names.sort();
}

/**
 * Collect the items tagged with `name`, in file order.
 *
 * Items tagged with the context more than once appear only once. Unknown
 * context names produce an empty array.
 */
export function listContextTasks(
  items: TodoItem[],
  name: string,
  status?: ContextStatus,
): TodoRecord[] {
  return items
    .filter(
      (item) =>
        item.contexts.includes(name) &&
        matchesStatus(item.completed, status),
    )
    .map(toTodoRecord);
}
