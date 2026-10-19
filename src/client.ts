import { parseDocument } from "./parse.ts";
import type { TodoFileHooks, TodoItem } from "./types.ts";

/** The read interface returned by {@link createTodoTxt}. */
export interface TodoTxtClient {
  /** Read the todo.txt contents through the hook and parse them. */
  read: () => Promise<TodoItem[]>;
}

/**
 * Create a todo.txt client backed by consumer-supplied file hooks.
 *
 * The library performs no IO of its own: `hooks.read` is responsible for
 * producing the file contents and `hooks.write` will be used by the write APIs
 * once they are implemented.
 */
export function createTodoTxt(hooks: TodoFileHooks): TodoTxtClient {
  return {
    async read() {
      const contents = await hooks.read();
      return parseDocument(contents);
    },
  };
}
