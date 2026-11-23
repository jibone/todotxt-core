import { readFile, writeFile } from "node:fs/promises";
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
 * These are the {@link createTodoTxt} options the adapter forwards; the
 * adapter supplies the `read` and `write` hooks itself, so a client created
 * through it is always write-enabled and its records always carry `line`.
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
  /**
   * Source of "today" for the default completion date of
   * {@link TodoTxtClient.complete}; see
   * {@link TodoClientOptions.today}. Default: the system clock's local
   * date.
   */
  today?: () => string;
  /** Bring-your-own logger; silent when omitted. */
  logger?: TodoLogger;
}

/**
 * Create a todo.txt client that reads and writes the file with
 * `node:fs/promises`.
 *
 * This is the `@jibone/todotxt-core/node` subpath export, so Node consumers
 * do not need to write the hook boilerplate:
 *
 * ```ts
 * import { createNodeTodoTxt } from "@jibone/todotxt-core/node";
 *
 * const todos = createNodeTodoTxt("todo.txt");
 * ```
 *
 * `path` is a file path or a `URL`, passed straight to `readFile` and
 * `writeFile`. The `encoding` option selects the file's character encoding
 * (default `"utf8"`). All client behavior — caching, filtering, warnings,
 * logging, writes, `includeSource`, `caseSensitive`, `today` — matches
 * {@link createTodoTxt}.
 *
 * Filesystem errors propagate untouched: `readFile` and `writeFile` reject
 * with `Error` instances that carry a `code` such as `ENOENT`, which the
 * client passes through rather than wrapping in a `TodoReadError` or
 * `TodoWriteError`.
 *
 * The adapter also works under Bun, which implements `node:fs/promises`; a
 * separate Bun subpath is unnecessary.
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
  const {
    encoding = "utf8",
    includeSource,
    caseSensitive,
    today,
    logger,
  } = options ?? {};

  return createTodoTxt<TData>({
    read: () => readFile(path, { encoding }),
    write: (contents) => writeFile(path, contents, { encoding }),
    includeSource,
    caseSensitive,
    today,
    logger,
  });
}
