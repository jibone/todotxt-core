import { createTodoTxt } from "../index.ts";
import type { TodoRecord } from "../index.ts";
import { section } from "./print.ts";

function printTitles(label: string, records: TodoRecord[]): void {
  const titles = records.map((record) => record.description).join(", ");
  console.log(`  ${label}: ${titles || "(none)"}`);
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

section("refresh() - re-read and replace the cache");
let version = 1;
let readCalls = 0;

const todos = createTodoTxt({
  // An in-memory file that changes between reads: a stand-in for a
  // todo.txt edited on disk while the client is running.
  read: () => {
    readCalls += 1;
    return [
      "(A) Backup the photo album @computer",
      `Upload album v${version} due:2024-04-01 due:2024-06-01 +GarageSale`,
    ].join("\n");
  },
});

printTitles("cached", await todos.pending());
console.log(`  reads: ${readCalls}`);

version = 2;
printTitles("refresh()", await todos.refresh());
console.log(`  reads: ${readCalls}`);

printTitles("cached", await todos.pending());
console.log(`  reads: ${readCalls} (refresh() replaced the cache)`);

section("invalidate() - drop the cache without reading");
todos.invalidate();
printTitles("cached", await todos.pending());
console.log(`  reads: ${readCalls} (the next query read once more)`);

const summary = await todos.summary();
console.log(`  summary total: ${summary.total}`);
console.log(`  reads: ${readCalls} (later queries reuse the new cache)`);

section("invalidate() during a read - a late read never lands");
let readCount = 0;
const editing = createTodoTxt({
  read: async () => {
    readCount += 1;
    if (readCount === 1) {
      await delay(20); // the first read is slow and gets invalidated
      return "Stale task due:a due:b";
    }
    return "Fresh task";
  },
});

const stale = editing.all(); // read 1 starts
editing.invalidate(); // its result is no longer wanted
const fresh = await editing.all(); // read 2 wins the race
const staleRecords = await stale; // still resolves for its caller

printTitles("read 2", fresh);
printTitles("read 1", staleRecords);
printTitles("cache", await editing.pending());
console.log(`  reads: ${readCount} (the slow read never repopulated the cache)`);

section("isStale() - has the file changed outside this client?");
// The hooks below share one mutable string: writing to it directly stands in
// for todo.txt being edited by another program while the client runs.
let disk = "(A) Backup the photo album @computer\n";
let diskReads = 0;

const watching = createTodoTxt({
  read: () => {
    diskReads += 1;
    return disk;
  },
  write: (next: string) => {
    disk = next;
  },
  today: () => "2026-11-22",
});

await watching.all(); // read and cache the snapshot
console.log(`  after the first read:  ${await watching.isStale()} (reads: ${diskReads})`);

await watching.add({ description: "Buy photo sleeves" }); // one of our own writes
console.log(`  after our own write:   ${await watching.isStale()} (reads: ${diskReads})`);

disk = "x 2026-11-22 (A) Backup the photo album @computer\nEdited elsewhere\n"; // external edit
console.log(`  after an external edit: ${await watching.isStale()} (one more read, no reparse)`);

await watching.refresh(); // reload when the probe says the snapshot is obsolete
console.log(`  after refresh():       ${await watching.isStale()}`);

// There is no TTL, background refresh, or file watching: poll `isStale()`
// from your own timer and call `refresh()` when it reports `true`. Before
// the first read and after `invalidate()` it reports `true` without reading
// at all.
