import { createTodoTxt } from "../index.ts";
import { printNames, printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section("All projects");
printNames(await todos.projects());

section("Pending projects");
printNames(await todos.pending().projects());

section("Completed projects");
printNames(await todos.completed().projects());

const project = "TodoTxt";

section(`All +${project} records`);
printRecords(await todos.project(project));

section(`Pending +${project} records`);
printRecords(await todos.project(project).pending());

section(`Completed +${project} records`);
printRecords(await todos.project(project).completed());

section(`Contexts used by +${project}`);
printNames(await todos.project(project).contexts());

section(`Contexts used by pending +${project} records`);
printNames(await todos.project(project).pending().contexts());

section(`Contexts used by completed +${project} records`);
printNames(await todos.project(project).completed().contexts());

section("Project filters intersect");
printRecords(await todos.project("TodoTxt").project("OpenSource"));

section("Project filters combine with context filters");
printRecords(await todos.project("TodoTxt").context("computer"));
