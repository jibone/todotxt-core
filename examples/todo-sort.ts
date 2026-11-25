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
  'pending().sortByMeta("due") - sorts by any metadata key, missing last',
);
printRecords(await todos.pending().sortByMeta("due"));

section(
  'sortByMeta("due", "desc") - reverses only the value comparison',
);
printRecords(await todos.sortByMeta("due", "desc"));

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

section('sortBy("priority").limit(5) - the top five by priority');
printRecords(await todos.sortBy("priority").limit(5));

section(
  'sortBy("completedAt", "desc").limit(3) - the newest three completions',
);
printRecords(await todos.sortBy("completedAt", "desc").limit(3));

section("pending().offset(10) - everything after the first ten pending");
printRecords(await todos.pending().offset(10));

