import { createTodoTxt } from "../index.ts";
import { printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section('sortBy("priority") - A first, then B-Z, unprioritized last');
printRecords(await todos.sortBy("priority"));

section('sortBy("priority", "desc") - reverses the letters, nulls still last');
printRecords(await todos.sortBy("priority", "desc"));

section(
  'pending().sortBy("due") - missing and invalid due values sort last',
);
printRecords(await todos.pending().sortBy("due"));

section('sortBy("due", "desc") - reverses only the value comparison');
printRecords(await todos.sortBy("due", "desc"));

section('sortBy("createdAt") - earliest first, records without dates last');
printRecords(await todos.sortBy("createdAt"));

section(
  'sortBy("completedAt", "desc") - latest completion first, nulls last',
);
printRecords(await todos.sortBy("completedAt", "desc"));

section('sortBy("description") - localeCompare ordering, ties keep file order');
printRecords(await todos.sortBy("description"));

section('pending().sortBy("priority") - sorting applies after filtering');
printRecords(await todos.pending().sortBy("priority"));

section('sortBy("priority").sortBy("description") - the last call wins');
printRecords(await todos.sortBy("priority").sortBy("description"));

section("count() and first() honor the sort step");
console.log(`  count: ${await todos.sortBy("priority").count()}`);
console.log(
  `  first: ${(await todos.sortBy("priority").first())?.description}`,
);
console.log(
  `  first (desc): ${(await todos.sortBy("priority", "desc").first())?.description}`,
);
