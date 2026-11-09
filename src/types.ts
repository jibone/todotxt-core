/**
 * A value that may or may not be wrapped in a Promise.
 *
 * Hooks use this so consumers can supply either synchronous or asynchronous
 * implementations.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * File access callbacks supplied by the consumer.
 *
 * The library itself never touches the filesystem. `read` is used by
 * {@link createTodoTxt}; `write` is part of the contract for the upcoming
 * write APIs. The write hook's return value is ignored, so it may return
 * anything (for example `Bun.write`'s `Promise<number>`).
 */
export interface TodoFileHooks {
  read: () => MaybePromise<string>;
  write: (contents: string) => MaybePromise<unknown>;
}

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
