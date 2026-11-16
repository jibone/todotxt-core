import { createTodoTxt } from "../index.ts";
import { printNames, printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section("all() - every line parsed into JSON");
printRecords(await todos.all());

section("pending() - records that are not completed");
printRecords(await todos.pending());

section("completed() - records that are completed");
printRecords(await todos.completed());

section("projects() / contexts() - unique names, alphabetically sorted");
printNames(await todos.projects());
printNames(await todos.contexts());

section("pending().projects() / pending().contexts()");
printNames(await todos.pending().projects());
printNames(await todos.pending().contexts());

section("completed().projects() / completed().contexts()");
printNames(await todos.completed().projects());
printNames(await todos.completed().contexts());

const project = "TodoTxt";

section(`project("${project}") - all, pending, and completed records`);
printRecords(await todos.project(project));
printRecords(await todos.project(project).pending());
printRecords(await todos.project(project).completed());

const context = "phone";

section(`context("${context}") - all, pending, and completed records`);
printRecords(await todos.context(context));
printRecords(await todos.context(context).pending());
printRecords(await todos.context(context).completed());

section('project("GarageSale").contexts() - all, pending, and completed');
printNames(await todos.project("GarageSale").contexts());
printNames(await todos.project("GarageSale").pending().contexts());
printNames(await todos.project("GarageSale").completed().contexts());

section('context("home").projects() - all, pending, and completed');
printNames(await todos.context("home").projects());
printNames(await todos.context("home").pending().projects());
printNames(await todos.context("home").completed().projects());

section('project("TodoTxt").context("computer") - combined filters');
printRecords(await todos.project("TodoTxt").context("computer"));
printRecords(await todos.project("TodoTxt").context("computer").pending());
printRecords(await todos.project("TodoTxt").context("computer").completed());

section("Filters compose, so statuses can be chained");
printRecords(await todos.pending().project("OpenSource").context("github"));

section('JSON output for project("TodoTxt").context("computer").pending()');
console.log(
  JSON.stringify(
    await todos.project("TodoTxt").context("computer").pending(),
    null,
    2,
  ),
);
