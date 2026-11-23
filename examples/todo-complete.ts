import { createTodoTxt } from "../index.ts";
import { section } from "./print.ts";

let contents = "(A) Call Mom @phone due:2026-11-25\nBackup hard drive @computer\n";

const todos = createTodoTxt({
  read: () => contents,
  write: (next: string) => {
    contents = next;
  },
  // Pinned so the example output is deterministic. Omit it to use the
  // system clock's local date.
  today: () => "2026-11-22",
});

const printFile = (label: string): void => {
  console.log(`  ${label}: ${JSON.stringify(contents)}`);
};

section("complete - defaults to the today hook");
printFile("before");
const mom = (await todos.all())[0]!;
const done = await todos.complete(mom);
console.log(`  returned: ${JSON.stringify(done)}`);
printFile("after");

section("complete drops the priority");
// Completed todo.txt lines never keep one, so it is cleared here; keeping
// it would be lost on the next parse. Store pri:A in data yourself if you
// want it back.
console.log(`  priority before: ${JSON.stringify(mom.priority)}`);
console.log(`  priority after:  ${JSON.stringify(done.priority)}`);

section("complete - an explicit date");
const backup = (await todos.all())[1]!;
await todos.complete(backup, "2026-11-20");
printFile("file");

section("uncomplete - removes the x marker and the date");
const reopened = await todos.uncomplete(done);
printFile("file");

section("chaining - returned records carry current lines");
// complete() and friends return the record as it now exists in the file,
// so writes can be chained without re-querying. Passing the OLD copy
// instead would reject: after the uncomplete above, `done` no longer
// matches the file.
const redone = await todos.complete(reopened);
console.log(`  completedAt: ${redone.completedAt}`);
printFile("file");
