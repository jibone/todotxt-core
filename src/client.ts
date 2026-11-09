import { cloneRecords } from "./clone.ts";
import { parseDocument } from "./parse.ts";
import { createTodoQuery } from "./query.ts";
import type { TodoQuery } from "./query.ts";
import type { TodoFileHooks, TodoRecord } from "./types.ts";

/** The read interface returned by {@link createTodoTxt}. */
export interface TodoTxtClient {
  /** Read fresh todo.txt contents, replace the cache, and return every record. */
  all: () => Promise<TodoRecord[]>;
  /** Query only records that are not completed, using the cached snapshot. */
  pending: () => TodoQuery;
  /** Query only records that are completed, using the cached snapshot. */
  completed: () => TodoQuery;
  /** Query records tagged with a single project name, using the cache. */
  project: (name: string) => TodoQuery;
  /** Query records tagged with a single context name, using the cache. */
  context: (name: string) => TodoQuery;
  /** List unique project names from the cached snapshot, alphabetically sorted. */
  projects: () => Promise<string[]>;
  /** List unique context names from the cached snapshot, alphabetically sorted. */
  contexts: () => Promise<string[]>;
}

/**
 * Create a todo.txt client backed by consumer-supplied file hooks.
 *
 * The library performs no IO of its own: `hooks.read` is responsible for
 * producing the file contents and `hooks.write` will be used by the write APIs
 * once they are implemented.
 *
 * Parsed records are cached in memory per client. The first query loads and
 * parses the file; later queries reuse that snapshot. {@link TodoTxtClient.all}
 * always reads fresh contents and replaces the cache, so it can be used to
 * refresh after the underlying file changes.
 *
 * Every line is parsed into a {@link TodoRecord} when the cache is populated.
 * Filters such as {@link TodoQuery.pending} and {@link TodoQuery.project}
 * operate on that array of JSON records, and plucks such as
 * {@link TodoQuery.projects} return unique, alphabetically sorted names.
 * Returned records are copies, so callers may mutate them without affecting the
 * cache.
 */
export function createTodoTxt(hooks: TodoFileHooks): TodoTxtClient {
  let cache: TodoRecord[] | undefined;
  let inFlight: Promise<TodoRecord[]> | undefined;
  let generation = 0;

  const readFresh = async (): Promise<TodoRecord[]> => {
    const currentGeneration = ++generation;
    const records = parseDocument(await hooks.read());

    if (currentGeneration === generation) {
      cache = records;
    }

    return records;
  };

  const refresh = (): Promise<TodoRecord[]> => {
    const promise = readFresh();
    inFlight = promise;

    void promise
      .finally(() => {
        if (inFlight === promise) {
          inFlight = undefined;
        }
      })
      .catch(() => {});

    return promise;
  };

  const loadCached = (): Promise<TodoRecord[]> => {
    if (inFlight) {
      return inFlight;
    }

    if (cache) {
      return Promise.resolve(cache);
    }

    return refresh();
  };

  const all = async (): Promise<TodoRecord[]> =>
    cloneRecords(await refresh());

  const query = createTodoQuery(loadCached);

  return {
    all,
    pending: query.pending,
    completed: query.completed,
    project: query.project,
    context: query.context,
    projects: query.projects,
    contexts: query.contexts,
  };
}
