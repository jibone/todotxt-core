import { publicRecord, publicRecords } from "./clone.ts";
import type { SourceExposure } from "./clone.ts";
import { localToday } from "./date.ts";
import { TodoReadError, TodoWriteError } from "./errors.ts";
import { formatRecord } from "./format.ts";
import { fingerprint, sameFingerprint } from "./hash.ts";
import type { ContentFingerprint } from "./hash.ts";
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
  ParseResult,
  ParseWarning,
  TodoAddInput,
  TodoClientOptions,
  TodoLogger,
  TodoRecord,
} from "./types.ts";
import {
  normalizeAddInput,
  normalizeTodoRecord,
  resolveCompletionDate,
} from "./validate.ts";
import {
  joinDocument,
  lastEol,
  recordsEqual,
  splitDocument,
} from "./write.ts";
import type { DocumentLine } from "./write.ts";

/**
 * The read and write interface returned by {@link createTodoTxt}.
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
  /**
   * Check whether the in-memory snapshot is obsolete.
   *
   * Resolves `true` when no snapshot exists — before the first read and
   * after {@link TodoTxtClient.invalidate}, without spending a read — or
   * when a fresh read returns different contents than the snapshot was
   * built from, meaning the file changed outside this client. Resolves
   * `false` right after a successful read or one of this client's own
   * writes, since both update the tracked contents.
   *
   * The probe spends one read and no reparse. It waits for this client's
   * queued writes to settle, so an in-flight write of your own never looks
   * like an external change, and it is pure: the cache, the warnings, and
   * in-flight reads are untouched. Read failures propagate untouched like
   * every read. This is a point-in-time check, not a subscription — poll
   * it from a timer or watcher and call {@link TodoTxtClient.refresh} when
   * it reports `true`. Internally the comparison uses a 53-bit content
   * fingerprint plus the contents' length, and a post-write snapshot
   * trusts the write hook to have written what it was given.
   */
  isStale: () => Promise<boolean>;
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
  /**
   * Append a new todo and return it as it now exists in the file.
   *
   * Only `todo.description` is required: `completed` defaults to `false`,
   * `priority`/`completedAt`/`createdAt` to `null`, `projects`/`contexts`
   * to `[]`, and `data` to `{}`. The todo is appended as one canonical line
   * at the end of the document — after any trailing blank lines — using the
   * file's last seen line ending (`\n` for an empty file). A file that ended
   * without a trailing newline gains one before the appended line.
   *
   * Invalid content rejects with a `TypeError` before any read or write
   * happens: the record must be writable as a canonical todo.txt line that
   * reparses into exactly the fields supplied. Requires the client's
   * `write` hook; without it the call rejects with a
   * {@link TodoWriteError}.
   */
  add: (todo: TodoAddInput<TData>) => Promise<TodoRecord<TData>>;
  /**
   * Replace the todo at `todo.line` with the supplied record and return it
   * as it now exists in the file.
   *
   * Pass the whole updated JSON record: every field is taken as given,
   * nothing is merged. The record must carry its `line`, which every record
   * this client returns does. Only the target line changes — the written
   * document keeps every other line byte-identical, including blank lines,
   * non-canonical tag order, and per-line line endings.
   *
   * Because the caller may have changed any field, `update` cannot verify
   * that the record still matches the file, so it trusts `line`. If the
   * file may have changed since the record was read — externally, or
   * through another of this client's writes — re-query first. Invalid
   * content rejects with a `TypeError`; a `line` that holds no todo
   * rejects with a {@link TodoWriteError}. Requires the client's `write`
   * hook.
   */
  update: (todo: TodoRecord<TData>) => Promise<TodoRecord<TData>>;
  /**
   * Mark a pending todo completed and return it as it now exists in the file.
   *
   * The line gains the `x` marker and the completion date, and loses its
   * priority: completed todo.txt lines never keep one, so it would be lost
   * on reparse. Store `pri:A` in `data` yourself if you want it back.
   * `date` defaults to the client's `today` hook — the system clock's local
   * date by default — and must otherwise be a real calendar date in
   * `YYYY-MM-DD` form, or the call rejects with a `TypeError`.
   *
   * The record must carry its `line` and still match the file: these APIs
   * receive the record exactly as this client reported it, so a mismatch
   * means the file moved underneath the caller, and the call rejects with
   * a {@link TodoWriteError} telling you to re-query and retry. Completing
   * an already-completed todo also rejects. Requires the client's `write`
   * hook.
   */
  complete: (
    todo: TodoRecord<TData>,
    date?: string,
  ) => Promise<TodoRecord<TData>>;
  /**
   * Mark a completed todo pending again and return it as it now exists in
   * the file.
   *
   * The line loses the `x` marker and the completion date. A completed line
   * with no description, creation date, or tags — bare `x ` or
   * `x 2011-03-03` — rejects with a {@link TodoWriteError} rather than
   * becoming a blank line: with the marker and date gone there would be no
   * todo left. Give it a description with {@link TodoTxtClient.update}
   * first, or {@link TodoTxtClient.delete} it. A priority lost at
   * completion time stays lost; see {@link TodoTxtClient.complete}. The
   * record must carry its `line` and match the file (see
   * {@link TodoTxtClient.complete}); uncompleting a pending todo rejects
   * with a {@link TodoWriteError}. Requires the client's `write` hook.
   */
  uncomplete: (todo: TodoRecord<TData>) => Promise<TodoRecord<TData>>;
  /**
   * Remove a todo's line from the file and return the record as it was.
   *
   * Blank lines elsewhere are preserved. The records after the removed line
   * move up, so line numbers held from earlier reads go stale — re-query
   * before further writes. The record must carry its `line` and match the
   * file (see {@link TodoTxtClient.complete}). Requires the client's
   * `write` hook.
   */
  delete: (todo: TodoRecord<TData>) => Promise<TodoRecord<TData>>;
}

/**
 * Create a todo.txt client backed by consumer-supplied file hooks.
 *
 * The library performs no IO of its own: `options.read` produces the file
 * contents, and `options.write` receives the full new document from the
 * write APIs — {@link TodoTxtClient.add}, {@link TodoTxtClient.update},
 * {@link TodoTxtClient.complete}, {@link TodoTxtClient.uncomplete}, and
 * {@link TodoTxtClient.delete}. Omit `write` for a read-only client whose
 * write methods reject with a {@link TodoWriteError}. `options.logger` is
 * optional and silent by default; when supplied, it receives read/write
 * lifecycle and parse warning diagnostics. Warnings from the most recent
 * read are also available as data through {@link TodoTxtClient.warnings}.
 * A `read` or `write` hook rejection propagates untouched when the rejected
 * value is an `Error`; any other value is wrapped in a
 * {@link TodoReadError} or {@link TodoWriteError} that carries the original
 * on `cause`. With `options.includeSource`, every record also carries the
 * 1-based `line` number and the exact `raw` line it was parsed from. With
 * `options.caseSensitive: false`, project and context matching compares
 * names through `toLowerCase()`; the default is exact matching.
 *
 * Every write is a read-modify-write: it re-reads current file contents,
 * splices the document so only the touched line changes (untouched lines
 * keep their exact bytes and line endings), and writes the full document
 * back through `write`. Writes serialize through an internal queue in call
 * order. A successful write replaces the cache with a reparse of the
 * written contents — later queries see the change without re-reading —
 * while a failed write leaves the cache and warnings untouched. Records
 * returned by a write-enabled client carry `line`, so they can be passed
 * straight back to the write APIs.
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
 * the old snapshot. {@link TodoTxtClient.isStale} checks the snapshot against
 * current file contents for one read and no reparse.
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
  let writeQueue: Promise<unknown> = Promise.resolve();
  let snapshotFingerprint: ContentFingerprint | undefined;

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
      // Logging is best-effort and must never break reads, writes, or queries.
    }
  };

  // Which source fields consumer-facing copies carry: `raw` needs
  // includeSource, while `line` also appears on write-enabled clients
  // because their write APIs locate records by it.
  const exposure: SourceExposure = {
    includeLine:
      options.includeSource === true || options.write !== undefined,
    includeRaw: options.includeSource === true,
  };

  const readContents = async (): Promise<string> => {
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

    return contents;
  };

  const readFresh = async (): Promise<TodoRecord[]> => {
    const currentGeneration = ++generation;

    log("debug", "Reading todo file");

    const contents = await readContents();

    // The internal snapshot always tracks each record's source line and
    // raw line so the write APIs can locate records and preserve untouched
    // lines; `exposure` decides what consumer-facing copies reveal.
    const result = parseDocumentResult(contents, {
      includeSource: true,
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
      snapshotFingerprint = fingerprint(contents);
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

  // Single-record version of the same assertion.
  const asTDataRecord = (record: TodoRecord): TodoRecord<TData> =>
    record as TodoRecord<TData>;

  const load: LoadRecords<TData> = async () =>
    publicRecords(asTData(await loadCached()), exposure);

  const all = async (): Promise<TodoRecord<TData>[]> =>
    publicRecords(asTData(await startRead()), exposure);

  const refresh = async (): Promise<TodoRecord<TData>[]> =>
    publicRecords(asTData(await startRead()), exposure);

  const invalidate = (): void => {
    // Bumping the generation orphans any in-flight read: its captured value
    // becomes stale, so it cannot repopulate the cache or the warnings when
    // it settles. It still resolves for its own callers.
    generation += 1;
    cache = undefined;
    inFlight = undefined;
    lastWarnings = [];
    snapshotFingerprint = undefined;
  };

  const warnings = (): ParseWarning[] =>
    lastWarnings.map((warning) => ({
      ...warning,
      meta: { ...warning.meta },
    }));

  // Serialize writes in call order so concurrent read-modify-write cycles
  // cannot lose one another's changes. The tail promise never rejects, so
  // one failed write never blocks the queue.
  const runWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const attempt = writeQueue.then(task);
    writeQueue = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt;
  };

  const requireWriteHook = (): NonNullable<TodoClientOptions["write"]> => {
    const write = options.write;

    if (write === undefined) {
      throw new TodoWriteError(
        "This client has no write hook. Supply options.write to createTodoTxt to use the write APIs.",
      );
    }

    return write;
  };

  // A staleness probe: read-only, but routed through the write queue so this
  // client's in-flight writes settle first and can never look like external
  // changes. It never touches the cache, the warnings, or the generation.
  const isStale = async (): Promise<boolean> => {
    if (snapshotFingerprint === undefined) {
      // No snapshot: trivially obsolete, and there is nothing to compare,
      // so no read is spent.
      return true;
    }

    return runWrite(async () => {
      // Re-read the fingerprint inside the queue: an invalidate() that
      // landed while this probe waited has dropped the snapshot.
      const current = snapshotFingerprint;

      if (current === undefined) {
        return true;
      }

      const contents = await readContents();
      return !sameFingerprint(fingerprint(contents), current);
    });
  };

  const requireRecordLine = (todo: TodoRecord, method: string): number => {
    if (todo === null || typeof todo !== "object") {
      // Runtime guard for untyped callers: a null record carries no line
      // like any other non-record, so it gets the same error rather than an
      // engine TypeError from the property access below.
      throw new TodoWriteError(
        `${method}() requires a record carrying its line number. Records from a write-enabled client always have one; re-query and pass a current record.`,
      );
    }

    const line = todo.line;

    if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
      throw new TodoWriteError(
        `${method}() requires a record carrying its line number. Records from a write-enabled client always have one; re-query and pass a current record.`,
      );
    }

    return line;
  };

  const noTodoAtLine = (method: string, line: number): TodoWriteError =>
    new TodoWriteError(
      `${method}() found no todo at line ${line}. Re-query and retry.`,
    );

  const staleTodoAtLine = (method: string, line: number): TodoWriteError =>
    new TodoWriteError(
      `${method}() found a different todo at line ${line} than the record supplied. The file changed since the record was read; re-query and retry.`,
    );

  const writeContents = async (
    write: NonNullable<TodoClientOptions["write"]>,
    contents: string,
  ): Promise<void> => {
    log("debug", "Writing todo file");

    try {
      await write(contents);
    } catch (cause) {
      // Mirrors the read side: real errors propagate untouched so existing
      // error-code checks keep working; anything else is wrapped.
      if (cause instanceof Error) {
        throw cause;
      }

      throw new TodoWriteError(
        "The write hook rejected with a non-Error value.",
        cause,
      );
    }
  };

  const commitWritten = (contents: string): ParseResult => {
    const result = parseDocumentResult(contents, {
      includeSource: true,
      onWarning: (warning) => {
        log("warn", warning.message, {
          ...warning.meta,
          code: warning.code,
          line: warning.line,
        });
      },
    });

    // Orphan any in-flight read so a read of the pre-write contents cannot
    // overwrite the post-write snapshot when it settles.
    generation += 1;
    cache = result.records;
    lastWarnings = result.warnings;
    snapshotFingerprint = fingerprint(contents);

    log("debug", "Wrote todo file", { records: result.records.length });

    return result;
  };

  const readForWrite = async (): Promise<{
    contents: string;
    records: TodoRecord[];
  }> => {
    // Writes always work from current file contents rather than the cache,
    // so a stale snapshot can never clobber changes made outside the client.
    // Parse warnings are not collected here: they describe the pre-write
    // file, and `commitWritten` re-collects them for the document that was
    // actually written.
    log("debug", "Reading todo file");

    const contents = await readContents();
    const records = parseDocumentResult(contents, { includeSource: true })
      .records;

    log("debug", "Parsed todo file", { records: records.length });

    return { contents, records };
  };

  const recordAt = (
    records: readonly TodoRecord[],
    line: number,
  ): TodoRecord | undefined =>
    records.find((record) => record.line === line);

  const replaceLine = (
    lines: DocumentLine[],
    line: number,
    record: TodoRecord,
    method: string,
  ): void => {
    const target = lines[line - 1];

    if (target === undefined) {
      // Unreachable once a record was found at this line; kept so a bad
      // splice can never write a silently truncated document.
      throw noTodoAtLine(method, line);
    }

    // The target keeps its own terminator, so the line's ending and the
    // file's trailing-newline style survive the edit.
    target.text = formatRecord(record);
  };

  const commitAt = (
    result: ParseResult,
    line: number,
    method: string,
  ): TodoRecord<TData> => {
    const record = recordAt(result.records, line);

    if (record === undefined) {
      // Unreachable for validated content; kept so the caller never
      // receives a record that is not in the file.
      throw new TodoWriteError(
        `${method}() could not find the written todo at line ${line}.`,
      );
    }

    return asTDataRecord(publicRecord(record, exposure));
  };

  const applyAdd = async (
    record: TodoRecord,
    write: NonNullable<TodoClientOptions["write"]>,
  ): Promise<TodoRecord<TData>> => {
    const { contents } = await readForWrite();
    const lines = splitDocument(contents);
    const eol = lastEol(lines);
    const last = lines.at(-1);

    if (last !== undefined && last.eol === "") {
      // The file ended without a terminator; the appended line needs one
      // before it.
      last.eol = eol;
    }

    const lineNumber = lines.length + 1;
    lines.push({ text: formatRecord(record), eol });

    const newContents = joinDocument(lines);
    await writeContents(write, newContents);

    return commitAt(commitWritten(newContents), lineNumber, "add");
  };

  const applyUpdate = async (
    record: TodoRecord,
    line: number,
    write: NonNullable<TodoClientOptions["write"]>,
  ): Promise<TodoRecord<TData>> => {
    const { contents, records } = await readForWrite();

    if (recordAt(records, line) === undefined) {
      throw noTodoAtLine("update", line);
    }

    const lines = splitDocument(contents);
    replaceLine(lines, line, record, "update");

    const newContents = joinDocument(lines);
    await writeContents(write, newContents);

    return commitAt(commitWritten(newContents), line, "update");
  };

  const locateUnchanged = (
    records: readonly TodoRecord[],
    todo: TodoRecord,
    line: number,
    method: "complete" | "uncomplete" | "delete",
  ): TodoRecord => {
    const current = recordAt(records, line);

    if (current === undefined) {
      throw noTodoAtLine(method, line);
    }

    // Unlike update(), these APIs receive the record exactly as this client
    // reported it, so any divergence means the file moved underneath the
    // caller; catching it here beats silently completing or deleting the
    // wrong todo.
    if (!recordsEqual(current, todo)) {
      throw staleTodoAtLine(method, line);
    }

    return current;
  };

  const applyComplete = async (
    todo: TodoRecord<TData>,
    line: number,
    date: string,
    write: NonNullable<TodoClientOptions["write"]>,
  ): Promise<TodoRecord<TData>> => {
    const { contents, records } = await readForWrite();
    const current = locateUnchanged(records, todo, line, "complete");

    if (current.completed) {
      throw new TodoWriteError(
        "complete() requires a pending todo, but this record is already completed.",
      );
    }

    const lines = splitDocument(contents);
    replaceLine(
      lines,
      line,
      {
        ...current,
        completed: true,
        completedAt: date,
        priority: null,
      },
      "complete",
    );

    const newContents = joinDocument(lines);
    await writeContents(write, newContents);

    return commitAt(commitWritten(newContents), line, "complete");
  };

  const applyUncomplete = async (
    todo: TodoRecord<TData>,
    line: number,
    write: NonNullable<TodoClientOptions["write"]>,
  ): Promise<TodoRecord<TData>> => {
    const { contents, records } = await readForWrite();
    const current = locateUnchanged(records, todo, line, "uncomplete");

    if (!current.completed) {
      throw new TodoWriteError(
        "uncomplete() requires a completed todo, but this record is still pending.",
      );
    }

    const next: TodoRecord = {
      ...current,
      completed: false,
      completedAt: null,
    };

    if (formatRecord(next) === "") {
      // A description-less completed line such as `x ` or `x 2011-03-03`
      // has nothing left once the marker and date are removed: writing it
      // would turn the todo into a blank line. Reject before any splice so
      // the file is never touched.
      throw new TodoWriteError(
        "uncomplete() cannot uncomplete this todo: without the completion marker and date its line would format to an empty line and the todo would vanish. Update it with a description first.",
      );
    }

    const lines = splitDocument(contents);
    replaceLine(lines, line, next, "uncomplete");

    const newContents = joinDocument(lines);
    await writeContents(write, newContents);

    return commitAt(commitWritten(newContents), line, "uncomplete");
  };

  const applyDelete = async (
    todo: TodoRecord<TData>,
    line: number,
    write: NonNullable<TodoClientOptions["write"]>,
  ): Promise<TodoRecord<TData>> => {
    const { contents, records } = await readForWrite();
    const current = locateUnchanged(records, todo, line, "delete");

    const lines = splitDocument(contents);

    if (lines.splice(line - 1, 1).length === 0) {
      // Unreachable once a record was found at this line; kept so a bad
      // splice can never write a silently truncated document.
      throw noTodoAtLine("delete", line);
    }

    const newContents = joinDocument(lines);
    await writeContents(write, newContents);
    commitWritten(newContents);

    return asTDataRecord(publicRecord(current, exposure));
  };

  const resolveToday = (): string => options.today?.() ?? localToday();

  // Input validation is pure, so it runs before the write queue: invalid
  // content never consumes a write slot, and its TypeError rejection
  // surfaces immediately instead of after queued writes settle. The write
  // hook is checked first of all so read-only clients learn that, not a
  // complaint about their record.
  const add = async (todo: TodoAddInput<TData>): Promise<TodoRecord<TData>> => {
    const write = requireWriteHook();
    const record = normalizeAddInput<TData>(todo, "add");
    return runWrite(() => applyAdd(record, write));
  };

  const update = async (
    todo: TodoRecord<TData>,
  ): Promise<TodoRecord<TData>> => {
    const write = requireWriteHook();
    const line = requireRecordLine(todo, "update");
    const record = normalizeTodoRecord(todo, "update");
    return runWrite(() => applyUpdate(record, line, write));
  };

  const complete = async (
    todo: TodoRecord<TData>,
    date?: string,
  ): Promise<TodoRecord<TData>> => {
    const write = requireWriteHook();
    const line = requireRecordLine(todo, "complete");
    const resolvedDate = resolveCompletionDate(
      date,
      resolveToday,
      "complete",
    );
    return runWrite(() => applyComplete(todo, line, resolvedDate, write));
  };

  const uncomplete = async (
    todo: TodoRecord<TData>,
  ): Promise<TodoRecord<TData>> => {
    const write = requireWriteHook();
    const line = requireRecordLine(todo, "uncomplete");
    return runWrite(() => applyUncomplete(todo, line, write));
  };

  const remove = async (
    todo: TodoRecord<TData>,
  ): Promise<TodoRecord<TData>> => {
    const write = requireWriteHook();
    const line = requireRecordLine(todo, "delete");
    return runWrite(() => applyDelete(todo, line, write));
  };

  const query = createTodoQuery<TData>(load, {
    filters: [],
    caseSensitive: options.caseSensitive ?? true,
  });

  return {
    all,
    refresh,
    invalidate,
    warnings,
    isStale,
    add,
    update,
    complete,
    uncomplete,
    delete: remove,
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
