// Smoke test for the built core package, run by CI under Node and Deno.
//
// It exercises `dist/index.js` — the shipped artifact, not the source —
// through a representative slice of the public API: parsing, warnings as
// data, canonical formatting, and a client over in-memory hooks running
// one full write cycle. Any failed check throws, so the process exits
// nonzero and the CI step fails.

import {
  createTodoTxt,
  formatDocument,
  formatRecord,
  parseDocument,
  parseDocumentResult,
} from "../dist/index.js";

function check(condition, message) {
  if (!condition) {
    throw new Error(`smoke: ${message}`);
  }
}

const sample = [
  "(A) 2026-11-01 Call Mom +Family @phone due:2026-11-05",
  "x 2026-11-02 Pay bills +Chores",
  "Read the todo.txt spec @reading",
].join("\n");

// Parsing.
const records = parseDocument(`${sample}\n`);
check(records.length === 3, "parseDocument: expected 3 records");
check(records[0].priority === "A", "parseDocument: priority");
check(records[0].createdAt === "2026-11-01", "parseDocument: creation date");
check(records[0].description === "Call Mom", "parseDocument: description");
check(records[0].projects.join() === "Family", "parseDocument: projects");
check(records[0].contexts.join() === "phone", "parseDocument: contexts");
check(records[0].data.due === "2026-11-05", "parseDocument: metadata");
check(records[1].completed, "parseDocument: completion marker");
check(records[1].completedAt === "2026-11-02", "parseDocument: completion date");
check(
  records[1].priority === null,
  "parseDocument: no priority on completed records",
);

// Warnings as data.
const result = parseDocumentResult("2011-99-99 broken date\n");
check(result.records.length === 1, "parseDocumentResult: records");
check(
  result.warnings.length === 1,
  "parseDocumentResult: expected one warning",
);
check(
  result.warnings[0].code === "invalid-date",
  "parseDocumentResult: invalid-date code",
);
check(result.lineCount === 1, "parseDocumentResult: line count");
check(result.skippedLines === 0, "parseDocumentResult: skipped lines");

// Canonical formatting.
check(
  formatRecord(records[0]) ===
    "(A) 2026-11-01 Call Mom +Family @phone due:2026-11-05",
  "formatRecord: canonical line",
);
const formatted = formatDocument(records);
check(
  parseDocument(formatted).length === 3,
  "formatDocument: output reparses",
);
check(formatted.endsWith("\n"), "formatDocument: trailing separator");

// A client over in-memory hooks, through one full write cycle.
let file = "(A) Write the release notes +Release\n";
const todos = createTodoTxt({
  read: () => file,
  write: (contents) => {
    file = contents;
  },
  today: () => "2026-11-25",
});

check((await todos.all()).length === 1, "client: all()");
check((await todos.pending().count()) === 1, "client: pending().count()");
check((await todos.completed().count()) === 0, "client: completed().count()");
check((await todos.project("Release")).length === 1, "client: project()");

const added = await todos.add({ description: "Ship 1.0.0", projects: ["Release"] });
check(
  file === "(A) Write the release notes +Release\nShip 1.0.0 +Release\n",
  "client: add() writes through the hook",
);
check(added.line === 2, "client: add() returns the new record with its line");

const target = (await todos.all())[1];
const done = await todos.complete(target);
check(done.completed, "client: complete() flips completion");
check(
  file ===
    "(A) Write the release notes +Release\nx 2026-11-25 Ship 1.0.0 +Release\n",
  "client: complete() rewrites the line with the today hook",
);
check(
  (await todos.completed().count()) === 1,
  "client: cache reflects the write",
);

console.log("smoke ok: dist/index.js");
