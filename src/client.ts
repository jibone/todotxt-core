import { cloneRecords } from "./clone.ts";
import { parseDocument } from "./parse.ts";
import { createTodoQuery } from "./query.ts";
import type { TodoQuery } from "./query.ts";
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
 * The library performs no IO of its own: `options.read` is responsible for
 * producing the file contents and `options.write` will be used by the write
 * APIs once they are implemented. `options.logger` is optional and silent by
 * default; when supplied, it receives read lifecycle and parse warning
 * diagnostics. With `options.includeSource`, every record also carries the
 * 1-based `line` number and the exact `raw` line it was parsed from.
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
