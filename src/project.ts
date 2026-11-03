import { toTodoRecord } from "./record.ts";
import type { ContextListQuery, ContextTasksQuery } from "./context.ts";
import type { TodoItem, TodoRecord } from "./types.ts";

/** Status filter accepted by the project query builders. */
export type ProjectStatus = "pending" | "completed";

/**
 * A lazy query over project names.
 *
 * Awaiting the query reads the todo.txt contents and resolves to the matching
 * names. Chain {@link ProjectListQuery.pending} or
 * {@link ProjectListQuery.completed} to filter; the most recent call wins.
 */
export interface ProjectListQuery extends PromiseLike<string[]> {
  /** Only projects that have at least one unfinished item. */
  pending: () => ProjectListQuery;
  /** Only projects whose items are all completed. */
  completed: () => ProjectListQuery;
}

/**
 * A lazy query over the items in a single project.
 *
 * Awaiting the query reads the todo.txt contents and resolves to matching
 * {@link TodoRecord}s in file order. Chain {@link ProjectTasksQuery.pending}
 * or {@link ProjectTasksQuery.completed} to filter; the most recent call wins.
 */
export interface ProjectTasksQuery extends PromiseLike<TodoRecord[]> {
  /** Only items from the project that are not completed. */
  pending: () => ProjectTasksQuery;
  /** Only items from the project that are completed. */
  completed: () => ProjectTasksQuery;
  /** List the contexts used by items in this project, alphabetically sorted. */
  contexts: () => ContextListQuery;
  /** Narrow this project query to items that also carry `name`. */
  context: (name: string) => ContextTasksQuery;
}

function matchesStatus(
  completed: boolean,
  status: ProjectStatus | undefined,
): boolean {
  if (status === undefined) {
    return true;
  }

  return status === "completed" ? completed : !completed;
}

/**
 * Collect unique project names, alphabetically sorted.
 *
 * When `status` is `"pending"`, only projects with at least one unfinished
 * item are returned. When `status` is `"completed"`, only projects whose items
 * are all completed are returned. A project with a mix of both is therefore
 * considered pending.
 */
export function listProjects(
  items: TodoItem[],
  status?: ProjectStatus,
): string[] {
  const hasPending = new Map<string, boolean>();

  for (const item of items) {
    for (const name of item.projects) {
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
 * Items tagged with the project more than once appear only once. Unknown
 * project names produce an empty array.
 */
export function listProjectTasks(
  items: TodoItem[],
  name: string,
  status?: ProjectStatus,
): TodoRecord[] {
  return items
    .filter(
      (item) =>
        item.projects.includes(name) &&
        matchesStatus(item.completed, status),
    )
    .map(toTodoRecord);
}
