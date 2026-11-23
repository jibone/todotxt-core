// The Node adapter (`@jibone/todotxt-core/node`), which supplies both the
// read and the write hook, so the client is write-enabled and its records
// carry `line`.
//
// Run with: node examples/node/todo-write.ts
// Requires Node 22.18+ for native TypeScript type stripping.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeTodoTxt } from "../../src/node.ts";

// A real file in a temp directory, so the example writes to disk and cleans
// up after itself.
const tempDir = await mkdtemp(join(tmpdir(), "todotxt-core-write-"));
const todoFile = join(tempDir, "todo.txt");
await writeFile(todoFile, "(A) Call Mom @phone\nBuy milk\n");

const todos = createNodeTodoTxt(todoFile, { today: () => "2026-11-22" });

const showFile = async (): Promise<void> => {
  console.log(`  file: ${JSON.stringify(await readFile(todoFile, "utf8"))}`);
};

try {
  console.log("\n=== add ===");
  const added = await todos.add({
    description: "Email Dad",
    projects: ["Family"],
  });
  console.log(`  added at line ${added.line}`);
  await showFile();

  console.log("\n=== update ===");
  const updated = await todos.update({ ...added, priority: "B" });
  console.log(`  updated: ${JSON.stringify(updated)}`);
  await showFile();

  console.log("\n=== complete ===");
  // Omit the date to use the today hook, or pass an explicit YYYY-MM-DD.
  const mom = (await todos.all())[0]!;
  const done = await todos.complete(mom);
  console.log(`  completed at: ${done.completedAt} (priority: ${done.priority})`);
  await showFile();

  console.log("\n=== uncomplete ===");
  await todos.uncomplete(done);
  await showFile();

  console.log("\n=== delete ===");
  const milk = (await todos.all()).find((todo) => todo.description === "Buy milk")!;
  await todos.delete(milk);
  await showFile();

  // Filesystem errors propagate untouched, so error-code checks keep
  // working on writes as well as reads.
  const missing = createNodeTodoTxt(join(tempDir, "missing-dir", "todo.txt"));
  try {
    await missing.add({ description: "Task" });
  } catch (error) {
    console.log(`\nmissing directory fails with: ${(error as { code?: string }).code}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
