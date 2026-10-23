import { createTodoTxt } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

const records = await todos.all();

console.log(`Read ${records.length} todo(s) from ${todoFile.pathname}\n`);
console.log(JSON.stringify(records, null, 2));
