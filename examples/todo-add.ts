import { createTodoTxt } from "../index.ts";
import { section } from "./print.ts";

// The hooks are an in-memory string, so the example runs anywhere and never
// touches a real file. A real client would read and write todo.txt instead.
let contents = "(A) Call Mom @phone\n";

const todos = createTodoTxt({
  read: () => contents,
  write: (next: string) => {
    contents = next;
  },
  // Pinned so the example output is deterministic.
  today: () => "2026-11-22",
});

const printFile = (label: string): void => {
  console.log(`  ${label}: ${JSON.stringify(contents)}`);
};

section("add - only the description is required");
printFile("before");
const minimal = await todos.add({ description: "Pay rent" });
console.log(`  returned: ${JSON.stringify(minimal)}`);

section("add - full input");
const full = await todos.add({
  description: "Schedule pickup",
  priority: "B",
  createdAt: "2026-11-01",
  projects: ["GarageSale"],
  contexts: ["errands"],
  data: { due: "2026-11-25" },
});
console.log(`  returned: ${JSON.stringify(full)}`);

section("add - a pre-completed record");
await todos.add({
  description: "Sort pantry",
  completed: true,
  completedAt: "2026-10-30",
});
printFile("after");

section("the returned record comes from the file");
// Every write returns the record as it now exists in the file, carrying its
// line, so it can be passed straight back to the other write APIs.
console.log(`  first pending: ${JSON.stringify(await todos.pending().first())}`);
