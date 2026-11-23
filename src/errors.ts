/**
 * Thrown when a consumer-supplied read hook rejects with a value that is not
 * an `Error`.
 *
 * Rejections that are already `Error` instances — including filesystem errors
 * with a `code` such as `ENOENT` — propagate untouched, so existing
 * error-code checks keep working. Anything else, such as a thrown string or a
 * plain object, is wrapped; the original value is available on `cause`.
 */
export class TodoReadError extends Error {
  /** The value the read hook rejected with. */
  declare readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "TodoReadError";
  }
}

/**
 * Thrown when a write API cannot proceed, or when a consumer-supplied write
 * hook rejects with a value that is not an `Error`.
 *
 * Operational failures reject with this error: calling a write method on a
 * client created without a `write` hook, passing a record without a usable
 * `line`, or passing a record that no longer matches the file. Rejections
 * from the write hook that are already `Error` instances — including
 * filesystem errors with a `code` such as `EACCES` — propagate untouched,
 * matching the read side; anything else, such as a thrown string, is wrapped
 * with the original value available on `cause`. Invalid record content is a
 * programming error and rejects with a `TypeError` instead, matching the
 * query APIs' argument validation.
 */
export class TodoWriteError extends Error {
  /**
   * The value the write hook rejected with, when the failure is a wrapped
   * rejection. Operational failures leave it `undefined`.
   */
  declare readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "TodoWriteError";
  }
}
