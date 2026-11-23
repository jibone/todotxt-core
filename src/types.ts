/**
 * A value that may or may not be wrapped in a Promise.
 *
 * Hooks use this so consumers can supply either synchronous or asynchronous
 * implementations.
 */
export type MaybePromise<T> = T | Promise<T>;

/** Severity passed to a consumer-supplied logger. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Consumer-supplied logger.
 *
 * The library is silent by default. When a logger is provided, it receives a
 * level, a human-readable message, and optional structured context. Logging is
 * best-effort: implementations may throw or return a promise, and neither will
 * affect reads or queries.
 */
export type TodoLogger = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) => MaybePromise<unknown>;

/**
 * A non-fatal issue found while parsing.
 *
 * Warnings describe recoverable conditions; the parser still returns a record.
 *
 * - `duplicate-metadata-key`: a `key:value` key appears more than once; the
 *   last value wins.
 * - `invalid-date`: a leading `YYYY-MM-DD` value is not a real calendar date.
 *   The value is not used as a date and remains part of the description.
 * - `reserved-key`: a `key:value` token uses the reserved key `__proto__`.
 *   The token is not stored in `data` and stays in the description.
 */
export interface ParseWarning {
  /** Stable identifier for programmatic handling. */
  code: "duplicate-metadata-key" | "invalid-date" | "reserved-key";
  /** Human-readable description of the issue. */
  message: string;
  /** 1-based physical line number, when called through {@link parseDocument}. */
  line?: number;
  /** Structured details such as the offending key and values. */
  meta: Record<string, unknown>;
}

/** Receives parse warnings. */
export type ParseWarningHandler = (warning: ParseWarning) => void;

/**
 * Options for {@link parseLine} and {@link parseDocument}.
 */
export interface ParseOptions {
  /** Include `line` and `raw` on returned records. Default: `false`. */
  includeSource?: boolean;
  /**
   * 1-based line number attached to the record when {@link includeSource} is
   * on. Ignored by {@link parseDocument}, which numbers physical lines itself.
   */
  line?: number;
  /** Receives parse warnings. */
  onWarning?: ParseWarningHandler;
}

/**
 * The outcome of parsing a whole todo.txt document.
 *
 * Returned by {@link parseDocumentResult}. {@link parseDocument} returns the
 * {@link ParseResult.records} alone.
 */
export interface ParseResult {
  /** Every non-empty line parsed into a {@link TodoRecord}. */
  records: TodoRecord[];
  /**
   * Every warning from the document, in document order, annotated with the
   * 1-based physical line number.
   */
  warnings: ParseWarning[];
  /**
   * Number of physical lines in the input. A single trailing newline ends
   * the last line rather than starting an empty one, and the empty input has
   * no lines.
   */
  lineCount: number;
  /** Lines skipped because they were blank or whitespace-only. */
  skippedLines: number;
}

/**
 * Callbacks supplied by the consumer.
 *
 * The library itself never touches the filesystem. `read` produces the file
 * contents for every read and for the read step of every write (each write is
 * a read-modify-write against current file contents). `write` receives the
 * full new document and backs the write APIs — {@link TodoTxtClient.add},
 * {@link TodoTxtClient.update}, {@link TodoTxtClient.complete},
 * {@link TodoTxtClient.uncomplete}, and {@link TodoTxtClient.delete}. It is
 * optional: a client without it stays read-only, and its write methods reject
 * with a {@link TodoWriteError}. The write hook's return value is ignored, so
 * it may return anything (for example `Bun.write`'s `Promise<number>`).
 *
 * `logger` is an optional bring-your-own logger. It is silent when omitted.
 */
export interface TodoHooks {
  read: () => MaybePromise<string>;
  write?: (contents: string) => MaybePromise<unknown>;
  logger?: TodoLogger;
}

/** @deprecated Use {@link TodoHooks}. */
export type TodoFileHooks = TodoHooks;

/**
 * Options for creating a todo.txt client with {@link createTodoTxt}.
 *
 * Extends the file hooks with client behaviour switches.
 */
export interface TodoClientOptions extends TodoHooks {
  /** Include `line` and `raw` on every record. Default: `false`. */
  includeSource?: boolean;
  /**
   * Default matching behavior for project and context queries, including
   * their negations. Default: `true` (exact, case-sensitive).
   *
   * When `false`, names are compared with `toLowerCase()`, which is
   * deterministic across machines and locales but not full Unicode case
   * folding. Search is unaffected: it is case-insensitive by default. Name
   * plucks such as `projects()` always preserve original casing.
   */
  caseSensitive?: boolean;
  /**
   * Source of "today" for the default completion date of
   * {@link TodoTxtClient.complete}. Default: the system clock's local
   * calendar date, formatted as `YYYY-MM-DD` without timezone conversion.
   *
   * Supply it to pin the date for tests or deterministic apps. The hook must
   * return a real calendar date in `YYYY-MM-DD` form; anything else rejects
   * `complete()` with a `TypeError`.
   */
  today?: () => string;
}

/**
 * A single todo.txt line parsed into a JSON-friendly record.
 *
 * This is the only parsed representation. Inline metadata is separated out of
 * {@link TodoRecord.description} into dedicated fields. The original line is
 * not retained unless the caller opts in with `includeSource`, which adds the
 * {@link TodoRecord.line} and {@link TodoRecord.raw} source fields.
 *
 * `TData` types the {@link TodoRecord.data} metadata for consumers who know
 * which keys their file uses. It defaults to `Record<string, string>`, which
 * matches what the parser produces. Supplying it is an assertion about the
 * file, not a validation: the library never checks that the declared keys
 * exist. Declare it as a type with an index signature (for example
 * `Record<string, string> & { due: string }` or an interface extending
 * `Record<string, string>`), since plain interfaces do not satisfy the
 * constraint.
 */
export interface TodoRecord<
  TData extends Record<string, string> = Record<string, string>,
> {
  /** True when the line starts with `x ` (lowercase and followed by a space). */
  completed: boolean;
  /** Uppercase priority letter, e.g. `"A"` for `(A)`, or `null`. */
  priority: string | null;
  /**
   * Completion date in `YYYY-MM-DD` form, or `null`.
   *
   * The value is always a real calendar date. A shape-valid but nonexistent
   * date (such as `2011-99-99`) is left in the description instead.
   */
  completedAt: string | null;
  /**
   * Creation date in `YYYY-MM-DD` form, or `null`.
   *
   * The value is always a real calendar date. A shape-valid but nonexistent
   * date (such as `2011-99-99`) is left in the description instead.
   */
  createdAt: string | null;
  /** Task text with projects, contexts, and `key:value` metadata removed. */
  description: string;
  /** Projects found in the text, without the leading `+`. */
  projects: string[];
  /** Contexts found in the text, without the leading `@`. */
  contexts: string[];
  /**
   * Additional `key:value` metadata found in the text.
   *
   * If a key appears more than once, the last value wins.
   */
  data: TData;
  /**
   * 1-based physical line number in the source document.
   *
   * Present when parsing with `includeSource` — for a whole document it
   * counts every physical line, including blank ones, and for a single line
   * it is the number supplied via `ParseOptions.line`. It is also present on
   * every record returned by a write-enabled client (one created with a
   * `write` hook): the write APIs locate their target by this number.
   */
  line?: number;
  /**
   * Exact original line, without a trailing newline or a trailing `\r`. A
   * leading byte-order mark (U+FEFF) is kept, so the source stays
   * byte-faithful even when the parser strips it.
   *
   * Present only when parsing with `includeSource`. Leading and trailing
   * whitespace and tag order are preserved, unlike
   * {@link TodoRecord.description}.
   */
  raw?: string;
}

/**
 * Input for {@link TodoTxtClient.add}: a new todo with only its description
 * required.
 *
 * Every omitted field takes the default documented on
 * {@link TodoTxtClient.add}. `data` is `Partial<TData>` so declared metadata
 * keys stay typed; as everywhere, `TData` is an assertion, not a validation.
 */
export interface TodoAddInput<
  TData extends Record<string, string> = Record<string, string>,
> {
  /** Task text; must be non-empty and whitespace-normalized. */
  description: string;
  /** Default: `false`. */
  completed?: boolean;
  /** One uppercase letter `A`–`Z`, or `null`. Default: `null`. */
  priority?: string | null;
  /**
   * Completion date in `YYYY-MM-DD` form, or `null`. Only allowed together
   * with `completed: true`. Default: `null`.
   */
  completedAt?: string | null;
  /** Creation date in `YYYY-MM-DD` form, or `null`. Default: `null`. */
  createdAt?: string | null;
  /** Project names without the `+`. Default: `[]`. */
  projects?: string[];
  /** Context names without the `@`. Default: `[]`. */
  contexts?: string[];
  /** Metadata entries. Default: `{}`. */
  data?: Partial<TData>;
}
