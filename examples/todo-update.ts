import { createTodoTxt } from "../index.ts";
import { section } from "./print.ts";

let contents = [
  "First thing",
  // Deliberately non-canonical: extra spaces and shuffled tag order.
  "Sort   +b +a @z @y z:1 a:2",
  "",
  "Third thing",
  "",
].join("\n");

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

section("update - pass the whole record back with your edits");
// Query a record, mutate the JSON, and hand it back. Nothing is merged:
// every field of the record you pass is written as given.
const before = (await todos.all()).find((todo) =>
  todo.projects.includes("a"),
)!;

const updated = await todos.update({
  ...before,
  description: "Sort the garage",
  priority: "A",
  contexts: ["weekend"],
});
console.log(`  returned: ${JSON.stringify(updated)}`);

section("after - only the touched line changed");
printFile("file");
console.log("  line 1, the blank line, and line 4 keep their exact bytes;");
console.log("  the touched line is rewritten canonically");

section("update - removing a project");
await todos.update({
  ...updated,
  projects: updated.projects.filter((project) => project !== "b"),
});
printFile("file");

section("update - records must carry their line");
// Records from a write-enabled client always do. A hand-built record
// without one rejects with a TodoWriteError telling you to re-query.
try {
  await todos.update({ ...updated, line: undefined });
} catch (error) {
  console.log(`  ${(error as Error).message}`);
}
