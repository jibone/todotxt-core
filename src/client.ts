import { cloneRecords } from "./clone.ts";
import { TodoReadError } from "./errors.ts";
import { parseDocumentResult } from "./parse.ts";
import { createTodoQuery } from "./query.ts";
import type {
  LoadRecords,
  TodoMatchOptions,
  TodoNameCount,
  TodoQuery,
  TodoSortDirection,
  TodoSortField,
  TodoSummary,
} from "./query.ts";
import type {
  ParseWarning,
  TodoClientOptions,
  TodoLogger,
  TodoRecord,
} from "./types.ts";

/**
 * The read interface returned by {@link createTodoTxt}.
 *
 * `TData` types the `data` field of every record the client resolves to; it
 * defaults to `Record<string, string>`. See {@link TodoRecord}.
 */
export interface TodoTxtClient<
  TData extends Record<string, string> = Record<string, string>,
> {
  /** Read fresh todo.txt contents, replace the cache, and return every record. */
  all: () => Promise<TodoRecord<TData>[]>;
  /**
   * Re-read the file, replace the cache, and return the fresh records.
   *
   * Equivalent to {@link TodoTxtClient.all} in effect; it exists to state the
   * intent and for future divergence (for example a future
   * `refresh({ silent: true })`). Returned records are copies, so callers
   * may mutate them without affecting the cache. A failed refresh rejects
   * and leaves the previous cache in place.
   */
  refresh: () => Promise<TodoRecord<TData>[]>;
  /**
   * Drop the cached snapshot without reading; the next query re-reads.
   *
   * A read that was in flight when `invalidate()` was called still resolves
   * for its callers but can no longer populate the cache, and queries
   * started before the call may still resolve with the old snapshot. Since
   * the snapshot is gone, {@link TodoTxtClient.warnings} also resets to
   * empty until the next successful read.
   */
  invalidate: () => void;
  /**
   * Warnings from the most recent successful read, in document order.
   *
   * Empty before the first read, after a read without warnings, and after
   * {@link TodoTxtClient.invalidate}. A failed read leaves the previous
   * read's warnings in place. The returned array and its warnings are
   * copies, so callers may mutate them without affecting later calls. A
   * `logger`, when supplied, still receives warnings as they are found;
   * this is an additional access path, not a replacement.
   */
  warnings: () => ParseWarning[];
  /** Query only records that are not completed, using the cached snapshot. */
  pending: () => TodoQuery<TData>;
  /** Query only records that are completed, using the cached snapshot. */
  completed: () => TodoQuery<TData>;
  /**
   * Query records tagged with the project `name`, using the cache.
   *
   * An array matches any listed name; see {@link TodoQuery.project}.
   */
  project: (name: string | string[], options?: TodoMatchOptions) => TodoQuery<TData>;
  /** Query records tagged with the context `name`; see {@link TodoQuery.project}. */
  context: (name: string | string[], options?: TodoMatchOptions) => TodoQuery<TData>;
  /** Query records not tagged with the project `name`; see {@link TodoQuery.notProject}. */
  notProject: (name: string | string[], options?: TodoMatchOptions) => TodoQuery<TData>;
  /** Query records not tagged with the context `name`; see {@link TodoQuery.notProject}. */
  notContext: (name: string | string[], options?: TodoMatchOptions) => TodoQuery<TData>;
  /** Query records with the priority `letter`; see {@link TodoQuery.priority}. */
  priority: (letter: string | string[]) => TodoQuery<TData>;
  /** Query records whose description contains `text`; see {@link TodoQuery.search}. */
  search: (text: string, options?: TodoMatchOptions) => TodoQuery<TData>;
  /** Query records with the metadata `key`; see {@link TodoQuery.meta}. */
  meta: (key: string, value?: string) => TodoQuery<TData>;
  /** Query records that have the metadata `key`; see {@link TodoQuery.hasMeta}. */
  hasMeta: (key: string) => TodoQuery<TData>;
  /** Query records created strictly after `date`; see {@link TodoQuery.createdAfter}. */
  createdAfter: (date: string) => TodoQuery<TData>;
  /** Query records created strictly before `date`; see {@link TodoQuery.createdAfter}. */
  createdBefore: (date: string) => TodoQuery<TData>;
  /** Query records completed strictly after `date`; see {@link TodoQuery.createdAfter}. */
  completedAfter: (date: string) => TodoQuery<TData>;
  /** Query records completed strictly before `date`; see {@link TodoQuery.createdAfter}. */
  completedBefore: (date: string) => TodoQuery<TData>;
  /** Sort the whole cached snapshot; see {@link TodoQuery.sortBy}. */
  sortBy: (field: TodoSortField, direction?: TodoSortDirection) => TodoQuery<TData>;
  /**
   * Sort the whole cached snapshot by a metadata value; see
   * {@link TodoQuery.sortByMeta}.
   */
  sortByMeta: (key: string, direction?: TodoSortDirection) => TodoQuery<TData>;
  /** Count records in the cached snapshot; see {@link TodoQuery.count}. */
  count: () => Promise<number>;
  /** First record of the cached snapshot; see {@link TodoQuery.first}. */
  first: () => Promise<TodoRecord<TData> | undefined>;
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
 * diagnostics. Warnings from the most recent read are also available as data
 * through {@link TodoTxtClient.warnings}. A `read` hook rejection propagates
 * untouched when the rejected value is an `Error`; any other value is wrapped
 * in a {@link TodoReadError} that carries the original on `cause`. With
 * `options.includeSource`, every record also carries the 1-based `line` number
 * and the exact `raw` line it was parsed from. With
 * `options.caseSensitive: false`, project and context matching compares
 * names through `toLowerCase()`; the default is exact matching.
 *
 * `TData` optionally types the `data` metadata of every record the client
 * resolves to, for consumers who know which keys their file uses. It is an
 * assertion, not a validation: the parser never checks that declared keys
 * exist, so a missing key reads as `undefined` at runtime. Declare it as a
 * type with an index signature, such as
 * `Record<string, string> & { due: string }`; see {@link TodoRecord}.
 *
 * Parsed records are cached in memory per client. The first query loads and
 * parses the file; later queries reuse that snapshot. {@link TodoTxtClient.all}
 * and {@link TodoTxtClient.refresh} always read fresh contents and replace the
 * cache, so they can pick up changes to the underlying file, while
 * {@link TodoTxtClient.invalidate} drops the cache without reading so the
 * next query re-reads. Reads that settle after invalidation never repopulate
 * the cache, and queries started before invalidation may still resolve with
 * the old snapshot.
 *
 * Every line is parsed into a {@link TodoRecord} when the cache is populated.
 * Filters such as {@link TodoQuery.pending} and {@link TodoQuery.project}
 * operate on that array of JSON records, plucks such as
 * {@link TodoQuery.projects} return unique, alphabetically sorted names, and
 * aggregates such as {@link TodoQuery.summary} count pending and completed
 * records per name. Returned records are copies, so callers may mutate them
 * without affecting the cache.
 */
export function createTodoTxt<
  TData extends Record<string, string> = Record<string, string>,
>(options: TodoClientOptions): TodoTxtClient<TData> {
  let cache: TodoRecord[] | undefined;
  let lastWarnings: ParseWarning[] = [];
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

    let contents: string;
    try {
      contents = await options.read();
    } catch (cause) {
      // Real errors (including fs errors with a code such as ENOENT)
      // propagate untouched so existing error checks keep working; anything
      // else is wrapped so every read failure has a typed shape.
      if (cause instanceof Error) {
        throw cause;
      }

      throw new TodoReadError(
        "The read hook rejected with a non-Error value.",
        cause,
      );
    }

    const result = parseDocumentResult(contents, {
      includeSource: options.includeSource,
      onWarning: (warning) => {
        log("warn", warning.message, {
          ...warning.meta,
          code: warning.code,
          line: warning.line,
        });
      },
    });
    const records = result.records;
    log("debug", "Parsed todo file", { records: records.length });

    if (currentGeneration === generation) {
      cache = records;
      lastWarnings = result.warnings;
    }

    return records;
  };

  const startRead = (): Promise<TodoRecord[]> => {
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

    return startRead();
  };

  // The parser produces records with `Record<string, string>` metadata.
  // `TData` is the consumer's assertion about the keys their file carries, so
  // this cast is the boundary where that assertion is applied; nothing
  // validates it at runtime.
  const asTData = (records: TodoRecord[]): TodoRecord<TData>[] =>
    records as TodoRecord<TData>[];

  const load: LoadRecords<TData> = async () => asTData(await loadCached());

  const all = async (): Promise<TodoRecord<TData>[]> =>
    cloneRecords(asTData(await startRead()));

  const refresh = async (): Promise<TodoRecord<TData>[]> =>
    cloneRecords(asTData(await startRead()));

  const invalidate = (): void => {
    // Bumping the generation orphans any in-flight read: its captured value
    // becomes stale, so it cannot repopulate the cache or the warnings when
    // it settles. It still resolves for its own callers.
    generation += 1;
    cache = undefined;
    inFlight = undefined;
    lastWarnings = [];
  };

  const warnings = (): ParseWarning[] =>
    lastWarnings.map((warning) => ({
      ...warning,
      meta: { ...warning.meta },
    }));

  const query = createTodoQuery<TData>(load, {
    filters: [],
    caseSensitive: options.caseSensitive ?? true,
  });

  return {
    all,
    refresh,
    invalidate,
    warnings,
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
    sortByMeta: query.sortByMeta,
    count: query.count,
    first: query.first,
    projects: query.projects,
    contexts: query.contexts,
    summary: query.summary,
    countsByProject: query.countsByProject,
    countsByContext: query.countsByContext,
  };
}
