import { createTodoTxt } from "../index.ts";
import {
  dueDate,
  effectivePriority,
  isDueToday,
  isDueWithin,
  isOverdue,
} from "../src/ext.ts";
import { printRecords, section } from "./print.ts";

// The extension-tag helpers (`@jibone/todotxt-core/ext`), running on the
// sample todo.txt.
//
// Run with: bun examples/todo-ext.ts
//
// `today` is pinned so the output is deterministic. The helpers never read
// the clock themselves — real code passes the current date once, the same
// source it would give the client's `today` option.

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({ read: () => Bun.file(todoFile).text() });

// Against the sample file: 2011-03-05 is overdue, 2024-04-01 is due today,
// and 2024-04-08-style dates fall inside the week. A `due:not-a-date` value
// is ignored rather than thrown.
const today = "2024-04-01";

const pending = await todos.pending();

section(`isOverdue(todo, "${today}")`);
printRecords(pending.filter((todo) => isOverdue(todo, today)));

section(`isDueToday(todo, "${today}")`);
printRecords(pending.filter((todo) => isDueToday(todo, today)));

section(`isDueWithin(todo, 7, "${today}")`);
printRecords(pending.filter((todo) => isDueWithin(todo, 7, today)));

section("agenda - overdue or due within 7 days");
printRecords(
  pending.filter(
    (todo) => isOverdue(todo, today) || isDueWithin(todo, 7, today),
  ),
);

section("dueDate(todo) / effectivePriority(todo)");
for (const todo of pending) {
  const due = dueDate(todo) ?? "-";
  const priority = effectivePriority(todo) ?? "-";
  console.log(`  ${todo.description} — due: ${due}, priority: ${priority}`);
}
