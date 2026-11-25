import { createTodoTxt } from "../index.ts";
import { printNames, printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
  // Attach `line` and `raw` to every record.
  includeSource: true,
});

section("all() - every record with its source line and raw text");
printRecords(await todos.all());

section("line / raw for every record");
for (const todo of await todos.all()) {
  console.log(`  ${todo.line}: ${JSON.stringify(todo.raw)}`);
}

section("pending() - source fields survive filters");
printRecords(await todos.pending());

section('project("TodoTxt") - source fields survive plucks and chains');
printRecords(await todos.project("TodoTxt"));
printNames(await todos.project("TodoTxt").pending().contexts());

section("JSON output for the first pending record");
const [first] = await todos.pending();
console.log(JSON.stringify(first, null, 2));

section("byLine(2) - the record at a known line");
const atLine = await todos.byLine(2);
if (atLine !== undefined) {
  printRecords([atLine]);
}

section("onLine(2) - the filter form, composed with search");
printRecords(await todos.onLine(2).search("pickup"));

section("byLine(999) - an unknown line resolves undefined");
console.log(`  ${JSON.stringify(await todos.byLine(999))}`);

