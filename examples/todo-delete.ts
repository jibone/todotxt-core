import { createTodoTxt } from "../index.ts";
import { section } from "./print.ts";

let contents = "First thing\nSecond thing\n\nThird thing\n";

const todos = createTodoTxt({
  read: () => contents,
  write: (next: string) => {
    contents = next;
  },
});

const printFile = (label: string): void => {
  console.log(`  ${label}: ${JSON.stringify(contents)}`);
};

section("before");
printFile("file");

section("delete - removes the line and returns the record as it was");
const second = (await todos.all())[1]!;
const removed = await todos.delete(second);
console.log(`  removed: ${JSON.stringify(removed)}`);
printFile("after");

section("following lines move up; blank lines stay");
const after = await todos.all();
for (const todo of after) {
  console.log(`  line ${todo.line}: ${todo.description}`);
}

section("delete accepts the record returned by another write");
// Writes return records with current lines, so they chain without
// re-querying.
const added = await todos.add({ description: "Fresh task" });
await todos.delete(added);
printFile("file");

section("stale records reject instead of deleting the wrong todo");
// The record was read before the add above moved things around... in this
// case the lines happen to line up, so force a mismatch by editing the
// underlying file directly.
contents = contents.replace("First thing", "Changed externally");
try {
  await todos.delete(after[0]!);
} catch (error) {
  console.log(`  ${(error as Error).message}`);
}
