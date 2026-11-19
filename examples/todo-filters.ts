import { createTodoTxt } from "../index.ts";
import { printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section('priority("A") - exact match against the parsed priority');
printRecords(await todos.priority("A"));

section('priority(["A", "B"]) - an array is OR within one call');
printRecords(await todos.priority(["A", "B"]));

section('priority("A").project("Garden") - calls still compose with AND');
printRecords(await todos.priority("A").project("Garden"));

section('search("PR") - substring on the description, case-insensitive by default');
printRecords(await todos.search("PR"));

section('search("pr", { caseSensitive: true }) - opt back into exact matching');
printRecords(await todos.search("pr", { caseSensitive: true }));

section('search("sign").pending() - search composes with every other filter');
printRecords(await todos.search("sign").pending());

section('meta("due") - has the key, whatever the value');
printRecords(await todos.meta("due"));

section('meta("due", "2024-04-01") - exact value match');
printRecords(await todos.meta("due", "2024-04-01"));

section('hasMeta("due") - the readable presence check');
printRecords(await todos.hasMeta("due"));

section('notProject("GarageSale") - records without the project');
printRecords(await todos.notProject("GarageSale"));

section('notContext(["phone", "computer"]) - an array excludes every name');
printRecords(await todos.notContext(["phone", "computer"]));

section('createdAfter("2024-01-01") - strictly later creation dates');
printRecords(await todos.createdAfter("2024-01-01"));

section('completedBefore("2011-03-05") - strictly earlier completion dates');
printRecords(await todos.completedBefore("2011-03-05"));

section('project(["Garden", "Moving"]) - arrays work for names too');
printRecords(await todos.project(["Garden", "Moving"]));

section('project("garden", { caseSensitive: false }) - per-call case-insensitive');
printRecords(await todos.project("garden", { caseSensitive: false }));

section("count() / first() - terminal shortcuts over the cached snapshot");
console.log(`  every record: ${await todos.count()}`);
console.log(`  pending: ${await todos.pending().count()}`);
console.log(`  +TodoTxt: ${await todos.project("TodoTxt").count()}`);
console.log(`  first record: ${(await todos.first())?.description}`);

section("invalid date arguments throw when the query is built, before any IO");
try {
  todos.createdAfter("2024-02-30");
} catch (error) {
  console.log(`  caught ${(error as Error).name}: ${(error as Error).message}`);
}
