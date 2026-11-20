import { createTodoTxt } from "../index.ts";
import type { TodoNameCount } from "../index.ts";
import { section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

function printCounts(label: string, entries: TodoNameCount[]): void {
  console.log(`  ${label}:`);

  if (entries.length === 0) {
    console.log("    (none)");
    return;
  }

  for (const { name, counts } of entries) {
    console.log(
      `    ${name}: ${counts.total} total (${counts.pending} pending, ${counts.completed} completed)`,
    );
  }
}

section("summary() - totals plus per-project and per-context counts");
const summary = await todos.summary();
console.log(
  `  total: ${summary.total} (${summary.pending} pending, ${summary.completed} completed)`,
);
printCounts("projects", summary.projects);
printCounts("contexts", summary.contexts);

section("pending().summary() - aggregates respect filter chains");
const pending = await todos.pending().summary();
console.log(
  `  total: ${pending.total} (${pending.pending} pending, ${pending.completed} completed)`,
);
printCounts("projects", pending.projects);
printCounts("contexts", pending.contexts);

section("countsByProject() / countsByContext() - per-name counts alone");
printCounts("projects", await todos.countsByProject());
printCounts("contexts", await todos.countsByContext());

section('project("TodoTxt").countsByContext() - counts scoped to a filter');
printCounts("contexts", await todos.project("TodoTxt").countsByContext());

section("per-name totals count multi-tag records once per name");
const totals = summary.projects.reduce((sum, entry) => sum + entry.counts.total, 0);
console.log(
  `  sum of per-project totals: ${totals} (top-level total: ${summary.total})`,
);
console.log(
  "  a record tagged +TodoTxt +OpenSource counts once for each name, so",
);
console.log("  per-name totals do not sum to the top-level total.");
