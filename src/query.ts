import { listContexts, listContextTasks } from "./context.ts";
import { listProjectTasks, listProjects } from "./project.ts";
import type {
  ContextListQuery,
  ContextStatus,
  ContextTasksQuery,
} from "./context.ts";
import type {
  ProjectListQuery,
  ProjectStatus,
  ProjectTasksQuery,
} from "./project.ts";
import type { TodoItem } from "./types.ts";

type ReadItems = () => Promise<TodoItem[]>;

/** Wrap `read` so it only yields items tagged with the project `name`. */
function projectRead(read: ReadItems, name: string): ReadItems {
  return () =>
    read().then((items) =>
      items.filter((item) => item.projects.includes(name)),
    );
}

/** Wrap `read` so it only yields items tagged with the context `name`. */
function contextRead(read: ReadItems, name: string): ReadItems {
  return () =>
    read().then((items) =>
      items.filter((item) => item.contexts.includes(name)),
    );
}

/** Create a lazy query over project names backed by `read`. */
export function createProjectListQuery(
  read: ReadItems,
  status?: ProjectStatus,
): ProjectListQuery {
  return {
    pending: () => createProjectListQuery(read, "pending"),
    completed: () => createProjectListQuery(read, "completed"),
    then: (onfulfilled, onrejected) =>
      read()
        .then((items) => listProjects(items, status))
        .then(onfulfilled, onrejected),
  };
}

/** Create a lazy query over context names backed by `read`. */
export function createContextListQuery(
  read: ReadItems,
  status?: ContextStatus,
): ContextListQuery {
  return {
    pending: () => createContextListQuery(read, "pending"),
    completed: () => createContextListQuery(read, "completed"),
    then: (onfulfilled, onrejected) =>
      read()
        .then((items) => listContexts(items, status))
        .then(onfulfilled, onrejected),
  };
}

/** Create a lazy query over the items in `name` backed by `read`. */
export function createProjectTasksQuery(
  read: ReadItems,
  name: string,
  status?: ProjectStatus,
): ProjectTasksQuery {
  return {
    pending: () => createProjectTasksQuery(read, name, "pending"),
    completed: () => createProjectTasksQuery(read, name, "completed"),
    contexts: () => createContextListQuery(projectRead(read, name), status),
    context: (context) =>
      createContextTasksQuery(projectRead(read, name), context, status),
    then: (onfulfilled, onrejected) =>
      read()
        .then((items) => listProjectTasks(items, name, status))
        .then(onfulfilled, onrejected),
  };
}

/** Create a lazy query over the items in `name` backed by `read`. */
export function createContextTasksQuery(
  read: ReadItems,
  name: string,
  status?: ContextStatus,
): ContextTasksQuery {
  return {
    pending: () => createContextTasksQuery(read, name, "pending"),
    completed: () => createContextTasksQuery(read, name, "completed"),
    projects: () => createProjectListQuery(contextRead(read, name), status),
    project: (project) =>
      createProjectTasksQuery(contextRead(read, name), project, status),
    then: (onfulfilled, onrejected) =>
      read()
        .then((items) => listContextTasks(items, name, status))
        .then(onfulfilled, onrejected),
  };
}
