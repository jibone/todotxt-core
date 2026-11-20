import { cloneRecords } from "./clone.ts";
import { parseDocument } from "./parse.ts";
import { createTodoQuery } from "./query.ts";
import type {
  TodoMatchOptions,
  TodoNameCount,
  TodoQuery,
  TodoSortDirection,
  TodoSortField,
  TodoSummary,
} from "./query.ts";
import type {
  TodoClientOptions,
  TodoLogger,
  TodoRecord,
} from "./types.ts";

/** The read interface returned by {@link createTodoTxt}. */
export interface TodoTxtClient {
  /** Read fresh todo.txt contents, replace the cache, and return every record. */
  all: () => Promise<TodoRecord[]>;
  /** Query only records that are not completed, using the cached snapshot. */
  pending: () => TodoQuery;
  /** Query only records that are completed, using the cached snapshot. */
  completed: () => TodoQuery;
  /**
   * Query records tagged with the project `name`, using the cache.
   *
   * An array matches any listed name; see {@link TodoQuery.project}.
   */
  project: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Query records tagged with the context `name`; see {@link TodoQuery.project}. */
  context: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Query records not tagged with the project `name`; see {@link TodoQuery.notProject}. */
  notProject: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Query records not tagged with the context `name`; see {@link TodoQuery.notProject}. */
  notContext: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Query records with the priority `letter`; see {@link TodoQuery.priority}. */
  priority: (letter: string | string[]) => TodoQuery;
  /** Query records whose description contains `text`; see {@link TodoQuery.search}. */
  search: (text: string, options?: TodoMatchOptions) => TodoQuery;
  /** Query records with the metadata `key`; see {@link TodoQuery.meta}. */
  meta: (key: string, value?: string) => TodoQuery;
  /** Query records that have the metadata `key`; see {@link TodoQuery.hasMeta}. */
  hasMeta: (key: string) => TodoQuery;
  /** Query records created strictly after `date`; see {@link TodoQuery.createdAfter}. */
  createdAfter: (date: string) => TodoQuery;
  /** Query records created strictly before `date`; see {@link TodoQuery.createdAfter}. */
  createdBefore: (date: string) => TodoQuery;
  /** Query records completed strictly after `date`; see {@link TodoQuery.createdAfter}. */
  completedAfter: (date: string) => TodoQuery;
  /** Query records completed strictly before `date`; see {@link TodoQuery.createdAfter}. */
  completedBefore: (date: string) => TodoQuery;
  /** Sort the whole cached snapshot; see {@link TodoQuery.sortBy}. */
  sortBy: (field: TodoSortField, direction?: TodoSortDirection) => TodoQuery;
  /** Count records in the cached snapshot; see {@link TodoQuery.count}. */
  count: () => Promise<number>;
  /** First record of the cached snapshot; see {@link TodoQuery.first}. */
  first: () => Promise<TodoRecord | undefined>;
  /** List unique project names from the cached snapshot, alphabetically sorted. */
  projects: () => Promise<string[]>;
  /** List unique context names from the cached snapshot, alphabetically sorted. */
  contexts: () => Promise<string[]>;
  /** Aggregate counts for the cached snapshot; see {@link TodoQuery.summary}. */
  summary: () => Promise<TodoSummary>;
  /** Per-project counts for the cached snapshot; see {@link TodoQuery.countsByProject}. */
  countsByProject: () => Promise<TodoNameCount[]>;
  /** Per-context counts for the cached snapshot; see {@link TodoQuery.countsByContext}. */
  countsByContext: () => Promise<TodoNameCount[]>;
}

/**
 * Create a todo.txt client backed by consumer-supplied file hooks.
 *
 * The library performs no IO of its own: `options.read` is responsible for
 * producing the file contents and `options.write` will be used by the write
 * APIs once they are implemented. `options.logger` is optional and silent by
 * default; when supplied, it receives read lifecycle and parse warning
 * diagnostics. With `options.includeSource`, every record also carries the
 * 1-based `line` number and the exact `raw` line it was parsed from. With
 * `options.caseSensitive: false`, project and context matching compares
 * names through `toLowerCase()`; the default is exact matching.
 *
 * Parsed records are cached in memory per client. The first query loads and
 * parses the file; later queries reuse that snapshot. {@link TodoTxtClient.all}
 * always reads fresh contents and replaces the cache, so it can be used to
 * refresh after the underlying file changes.
 *
 * Every line is parsed into a {@link TodoRecord} when the cache is populated.
 * Filters such as {@link TodoQuery.pending} and {@link TodoQuery.project}
 * operate on that array of JSON records, plucks such as
 * {@link TodoQuery.projects} return unique, alphabetically sorted names, and
 * aggregates such as {@link TodoQuery.summary} count pending and completed
 * records per name. Returned records are copies, so callers may mutate them
 * without affecting the cache.
 */
export function createTodoTxt(options: TodoClientOptions): TodoTxtClient {
  let cache: TodoRecord[] | undefined;
  let inFlight: Promise<TodoRecord[]> | undefined;
  let generation = 0;

  const logger = options.logger;

  const log: TodoLogger = (level, message, meta) => {
    if (!logger) {
      return;
    }

    try {
      const result = logger(level, message, meta);

      if (
        result &&
        typeof (result as PromiseLike<unknown>).then === "function"
      ) {
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Logging is best-effort and must never break reads or queries.
    }
  };

  const readFresh = async (): Promise<TodoRecord[]> => {
    const currentGeneration = ++generation;

    log("debug", "Reading todo file");
    const contents = await options.read();
    const records = parseDocument(contents, {
      includeSource: options.includeSource,
      onWarning: (warning) => {
        log("warn", warning.message, {
          ...warning.meta,
          code: warning.code,
          line: warning.line,
        });
      },
    });
    log("debug", "Parsed todo file", { records: records.length });

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

  const query = createTodoQuery(loadCached, {
    filters: [],
    caseSensitive: options.caseSensitive ?? true,
  });

  return {
    all,
    pending: query.pending,
    completed: query.completed,
    project: query.project,
    context: query.context,
    notProject: query.notProject,
    notContext: query.notContext,
    priority: query.priority,
    search: query.search,
    meta: query.meta,
    hasMeta: query.hasMeta,
    createdAfter: query.createdAfter,
    createdBefore: query.createdBefore,
    completedAfter: query.completedAfter,
    completedBefore: query.completedBefore,
    sortBy: query.sortBy,
    count: query.count,
    first: query.first,
    projects: query.projects,
    contexts: query.contexts,
    summary: query.summary,
    countsByProject: query.countsByProject,
    countsByContext: query.countsByContext,
  };
}
