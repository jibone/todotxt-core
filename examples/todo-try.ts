import { createTodoTxt } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  read: () => Bun.file(todoFile).text(),
  write: (contents) => Bun.write(todoFile, contents),
});

// The first query reads and caches the file. Later queries reuse the cache.
const projects = await todos.projects();

for (const project of projects) {
  console.log(" === Project: ", project);

  const projectTasks = todos.project(project);

  const done = await projectTasks.completed();
  console.log(" task done: ", done.length);

  const pending = await projectTasks.pending();
  console.log(" task pending: ", pending.length);

  for (const task of pending) {
    console.log("  > ", task.description);
  }
}

// Use `await todos.all()` whenever you need to reload an externally changed file.
