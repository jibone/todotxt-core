import { parseDocument } from "./parse.ts";
import { toTodoRecord } from "./record.ts";
import type { TodoFileHooks, TodoItem, TodoRecord } from "./types.ts";

/** The read interface returned by {@link createTodoTxt}. */
export interface TodoTxtClient {
  /** Read the todo.txt contents through the hook and parse them. */
  read: () => Promise<TodoItem[]>;
  /** Read the todo.txt contents and return JSON-friendly todo records. */
  all: () => Promise<TodoRecord[]>;
}

/**
 * Create a todo.txt client backed by consumer-supplied file hooks.
 *
 * The library performs no IO of its own: `hooks.read` is responsible for
 * producing the file contents and `hooks.write` will be used by the write APIs
 * once they are implemented.
 */
export function createTodoTxt(hooks: TodoFileHooks): TodoTxtClient {
  async function read(): Promise<TodoItem[]> {
    const contents = await hooks.read();
    return parseDocument(contents);
  }

  return {
    read,
    async all() {
      return (await read()).map(toTodoRecord);
    },
  };
}
