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

/** A single parsed line from a todo.txt file. */
export interface TodoItem {
  /** The original line, without its trailing line ending. */
  raw: string;
  /** True when the line starts with `x ` (lowercase and followed by a space). */
  completed: boolean;
  /** Uppercase priority letter, e.g. `"A"` for `(A)`, or `null`. */
  priority: string | null;
  /** Completion date in `YYYY-MM-DD` form, or `null`. */
  completionDate: string | null;
  /** Creation date in `YYYY-MM-DD` form, or `null`. */
  creationDate: string | null;
  /**
   * Task text after the `x`, priority, and date prefixes.
   *
   * Inline metadata such as `+project`, `@context`, and `key:value` remains
   * part of the text.
   */
  text: string;
  /** Projects found in the text, without the leading `+`. */
  projects: string[];
  /** Contexts found in the text, without the leading `@`. */
  contexts: string[];
  /**
   * Additional `key:value` metadata found in the text.
   *
   * If a key appears more than once, the last value wins.
   */
  extensions: Record<string, string>;
}
