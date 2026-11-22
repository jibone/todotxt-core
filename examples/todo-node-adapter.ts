import { createNodeTodoTxt } from "../src/node.ts";
import { printNames, printRecords, section } from "./print.ts";

// The Node adapter (`@jibone/todotxt-core/node`), running under Bun.
//
// Run with: bun examples/todo-node-adapter.ts
//
// Bun implements `node:fs/promises`, so the adapter works unmodified here;
// no separate Bun subpath is needed.

const todoFile = new URL("./todo.txt", import.meta.url);

// No read hook to write: the adapter supplies it.
const todos = createNodeTodoTxt(todoFile);

section("all() - read through node:fs/promises");
printRecords(await todos.all());

section("pending()");
printRecords(await todos.pending());

section("projects() / contexts()");
printNames(await todos.projects());
printNames(await todos.contexts());

const project = "TodoTxt";

section(`project("${project}")`);
printRecords(await todos.project(project));

section("summary()");
console.log(await todos.summary());
