import { cloneRecords } from "./clone.ts";
import type { TodoRecord } from "./types.ts";

/** A predicate applied to every record in a query. */
export type TodoFilter = (todo: TodoRecord) => boolean;

/** Loads and parses every todo.txt record. */
export type LoadRecords = () => Promise<TodoRecord[]>;

/**
 * A lazy query over parsed todo records.
 *
 * Filters return a new query and perform no IO. Awaiting a query resolves
 * through the supplied loader; the client caches parsed records, so only the
 * first query reads the file. {@link TodoQuery.projects} and
 * {@link TodoQuery.contexts} are terminal plucks that resolve to unique,
 * alphabetically sorted names.
 */
export interface TodoQuery extends PromiseLike<TodoRecord[]> {
  /** Only records that are not completed. */
  pending: () => TodoQuery;
  /** Only records that are completed. */
  completed: () => TodoQuery;
  /** Only records tagged with the project `name`. */
  project: (name: string) => TodoQuery;
  /** Only records tagged with the context `name`. */
  context: (name: string) => TodoQuery;
  /** Unique project names in the current result, alphabetically sorted. */
  projects: () => Promise<string[]>;
  /** Unique context names in the current result, alphabetically sorted. */
  contexts: () => Promise<string[]>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function resolveRaw(
  load: LoadRecords,
  filters: TodoFilter[],
): Promise<TodoRecord[]> {
  const records = await load();

  if (filters.length === 0) {
    return records;
  }

  return records.filter((record) =>
    filters.every((filter) => filter(record)),
  );
}

async function resolveRecords(
  load: LoadRecords,
  filters: TodoFilter[],
): Promise<TodoRecord[]> {
  return cloneRecords(await resolveRaw(load, filters));
}

function pluckNames(
  load: LoadRecords,
  filters: TodoFilter[],
  pick: (todo: TodoRecord) => string[],
): Promise<string[]> {
  return resolveRaw(load, filters).then((records) =>
    uniqueSorted(records.flatMap(pick)),
  );
}

/**
 * Create a lazy query over the records loaded by `load`.
 *
 * Each filter method appends a predicate, so chained calls compose. For
 * example, `pending().completed()` matches nothing, while
 * `project("Work").pending()` matches pending records in `Work`.
 */
export function createTodoQuery(
  load: LoadRecords,
  filters: TodoFilter[] = [],
): TodoQuery {
  return {
    pending: () =>
      createTodoQuery(load, [...filters, (todo) => !todo.completed]),
    completed: () =>
      createTodoQuery(load, [...filters, (todo) => todo.completed]),
    project: (name) =>
      createTodoQuery(load, [
        ...filters,
        (todo) => todo.projects.includes(name),
      ]),
    context: (name) =>
      createTodoQuery(load, [
        ...filters,
        (todo) => todo.contexts.includes(name),
      ]),
    projects: () => pluckNames(load, filters, (todo) => todo.projects),
    contexts: () => pluckNames(load, filters, (todo) => todo.contexts),
    then: (onfulfilled, onrejected) =>
      resolveRecords(load, filters).then(onfulfilled, onrejected),
  };
}
