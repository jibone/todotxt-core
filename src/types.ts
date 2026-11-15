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
 */
export interface ParseWarning {
  /** Stable identifier for programmatic handling. */
  code: "duplicate-metadata-key";
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
 * Callbacks supplied by the consumer.
 *
 * The library itself never touches the filesystem. `read` is used by
 * {@link createTodoTxt}. `write` is optional until the write APIs land; when
 * they do, callers that mutate todos will need to provide it. The write hook's
 * return value is ignored, so it may return anything (for example
 * `Bun.write`'s `Promise<number>`).
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
 * A single todo.txt line parsed into a JSON-friendly record.
 *
 * This is the only parsed representation. Inline metadata is separated out of
 * {@link TodoRecord.description} into dedicated fields, and the original raw
 * line is not retained.
 */
export interface TodoRecord {
  /** True when the line starts with `x ` (lowercase and followed by a space). */
  completed: boolean;
  /** Uppercase priority letter, e.g. `"A"` for `(A)`, or `null`. */
  priority: string | null;
  /** Completion date in `YYYY-MM-DD` form, or `null`. */
  completedAt: string | null;
  /** Creation date in `YYYY-MM-DD` form, or `null`. */
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
  data: Record<string, string>;
}
