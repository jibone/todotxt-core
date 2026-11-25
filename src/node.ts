import { randomUUID } from "node:crypto";
import {
  chmod,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
 * Write `contents` to `filePath` atomically: a sibling temp file in the
 * same directory, then a rename over the target.
 *
 * The temp file lives next to the target so the rename stays on one
 * filesystem and cannot fail with `EXDEV`; POSIX rename is atomic, so a
 * crash mid-write swaps the file whole or not at all. An existing
 * target's mode is applied to the temp file before the rename, so a
 * shared todo.txt keeps its permissions across writes; a target that
 * does not exist yet is simply created.
 *
 * On any failure the temp file is removed best-effort and the original
 * error propagates untouched, keeping the adapter's documented
 * passthrough contract.
 */
async function writeFileAtomic(
  filePath: string,
  contents: string,
  encoding: BufferEncoding,
): Promise<void> {
  const tempPath = join(
    dirname(filePath),
    `${basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(tempPath, contents, { encoding });

    let mode: number | undefined;
    try {
      mode = (await stat(filePath)).mode & 0o777;
    } catch (error) {
      // A new target keeps the temp file's default mode; every other
      // stat failure is a real error and propagates.
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
    }

    if (mode !== undefined) {
      await chmod(tempPath, mode);
    }

    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
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
 * `path` is a file path or a `URL`. The `encoding` option selects the
 * file's character encoding (default `"utf8"`). All client behavior —
 * caching, filtering, warnings, logging, writes, `includeSource`,
 * `caseSensitive`, `today` — matches {@link createTodoTxt}.
 *
 * Writes are atomic: the new contents go to a sibling temp
 * file in the same directory, which is renamed over the target, so a
 * crash mid-write cannot truncate or half-write the file. An existing
 * target keeps its mode across writes. The rename replaces the target
 * path itself: a symlinked target becomes a regular file on its first
 * write, and the file it pointed to keeps its old contents.
 *
 * Filesystem errors propagate untouched: the `node:fs/promises` calls
 * reject with `Error` instances that carry a `code` such as `ENOENT`,
 * which the client passes through rather than wrapping in a
 * `TodoReadError` or `TodoWriteError`.
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

  // Resolve once, so the read, the temp-file naming, and the rename all
  // address the identical path — for `string` and `URL` inputs alike.
  const filePath = typeof path === "string" ? path : fileURLToPath(path);

  return createTodoTxt<TData>({
    read: () => readFile(filePath, { encoding }),
    write: (contents) => writeFileAtomic(filePath, contents, encoding),
    includeSource,
    caseSensitive,
    today,
    logger,
  });
}
