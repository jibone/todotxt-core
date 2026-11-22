import { readFile } from "node:fs/promises";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";
import type {
  TodoClientOptions,
  TodoLogger,
  TodoRecord,
} from "./types.ts";

/**
 * Options for {@link createNodeTodoTxt}.
 *
 * These are the {@link createTodoTxt} options the adapter can forward; the
 * adapter supplies the `read` hook itself, and `write` is not exposed until
 * the write APIs exist.
 */
export interface NodeTodoTxtOptions {
  /** Character encoding of the todo.txt file. Default: `"utf8"`. */
  encoding?: BufferEncoding;
  /** Include `line` and `raw` on every record. Default: `false`. */
  includeSource?: boolean;
  /**
   * Default matching behavior for project and context queries; see
   * {@link TodoClientOptions.caseSensitive}. Default: `true`.
   */
  caseSensitive?: boolean;
  /** Bring-your-own logger; silent when omitted. */
  logger?: TodoLogger;
}

/**
 * Create a todo.txt client that reads the file with `node:fs/promises`.
 *
 * This is the `@jibone/todotxt-core/node` subpath export, so Node consumers
 * do not need to write the read-hook boilerplate:
 *
 * ```ts
 * import { createNodeTodoTxt } from "@jibone/todotxt-core/node";
 *
 * const todos = createNodeTodoTxt("todo.txt");
 * ```
 *
 * `path` is a file path or a `URL`, passed straight to `readFile`. The
 * `encoding` option selects the file's character encoding (default
 * `"utf8"`). All client behavior — caching, filtering, warnings, logging,
 * `includeSource`, `caseSensitive` — matches {@link createTodoTxt}.
 *
 * Filesystem errors propagate untouched: `readFile` rejects with `Error`
 * instances that carry a `code` such as `ENOENT`, which the client passes
 * through rather than wrapping in a `TodoReadError`.
 *
 * The adapter also works under Bun, which implements `node:fs/promises`; a
 * separate Bun subpath is unnecessary. `write` is not exposed until the
 * write APIs exist.
 *
 * `TData` optionally types the `data` metadata of every record the client
 * resolves to; see {@link TodoRecord}.
 */
export function createNodeTodoTxt<
  TData extends Record<string, string> = Record<string, string>,
>(
  path: string | URL,
  options?: NodeTodoTxtOptions,
): TodoTxtClient<TData> {
  const { encoding = "utf8", includeSource, caseSensitive, logger } =
    options ?? {};

  return createTodoTxt<TData>({
    read: () => readFile(path, { encoding }),
    includeSource,
    caseSensitive,
    logger,
  });
}
