import { createTodoTxt } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

const items = await todos.read();

console.log(`Read ${items.length} item(s) from ${todoFile.pathname}\n`);

for (const item of items) {
  const status = item.completed ? "x" : " ";
  const priority = item.priority === null ? "  " : `(${item.priority})`;
  const dates = [item.completionDate, item.creationDate]
    .filter((date): date is string => date !== null)
    .join(" ");

  console.log(`${status} ${priority} ${item.text}`);
  if (dates !== "") {
    console.log(`   dates: ${dates}`);
  }
  if (item.projects.length > 0) {
    console.log(`   projects: ${item.projects.join(", ")}`);
  }
  if (item.contexts.length > 0) {
    console.log(`   contexts: ${item.contexts.join(", ")}`);
  }
  if (Object.keys(item.extensions).length > 0) {
    console.log(`   metadata: ${JSON.stringify(item.extensions)}`);
  }
}
