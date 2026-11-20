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
