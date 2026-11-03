import { parseDocument } from "./parse.ts";
import {
  createContextListQuery,
  createContextTasksQuery,
  createProjectListQuery,
  createProjectTasksQuery,
} from "./query.ts";
import { toTodoRecord } from "./record.ts";
import type { ContextListQuery, ContextTasksQuery } from "./context.ts";
import type { ProjectListQuery, ProjectTasksQuery } from "./project.ts";
import type { TodoFileHooks, TodoItem, TodoRecord } from "./types.ts";

/** The read interface returned by {@link createTodoTxt}. */
export interface TodoTxtClient {
  /** Read the todo.txt contents through the hook and parse them. */
  read: () => Promise<TodoItem[]>;
  /** Read the todo.txt contents and return JSON-friendly todo records. */
  all: () => Promise<TodoRecord[]>;
  /** List unique project names, alphabetically sorted. */
  projects: () => ProjectListQuery;
  /** Query the items tagged with a single project name. */
  project: (name: string) => ProjectTasksQuery;
  /** List unique context names, alphabetically sorted. */
  contexts: () => ContextListQuery;
  /** Query the items tagged with a single context name. */
  context: (name: string) => ContextTasksQuery;
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
    projects() {
      return createProjectListQuery(read);
    },
    project(name) {
      return createProjectTasksQuery(read, name);
    },
    contexts() {
      return createContextListQuery(read);
    },
    context(name) {
      return createContextTasksQuery(read, name);
    },
  };
}
