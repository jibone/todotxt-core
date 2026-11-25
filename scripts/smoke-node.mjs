// Smoke test for the built `/node` subpath, run by CI under Node.
//
// It exercises `dist/node.mjs` — the shipped artifact, not the source —
// against a real temp directory: a read, an `add` write, and a
// `complete` write, which each go through the adapter's atomic path
// (temp file, chmod, rename), and it asserts that path leaves no temp
// files behind. Any failed check throws, so the process exits nonzero
// and the CI step fails.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeTodoTxt } from "../dist/node.mjs";

function check(condition, message) {
  if (!condition) {
    throw new Error(`smoke: ${message}`);
  }
}

const dir = await mkdtemp(join(tmpdir(), "todotxt-core-smoke-"));
const path = join(dir, "todo.txt");

try {
  await writeFile(path, "(A) Call Mom @phone\n");
  const todos = createNodeTodoTxt(path);

  check((await todos.all()).length === 1, "node adapter: reads the file");
  check((await todos.first()).priority === "A", "node adapter: parsed fields");

  await todos.add({ description: "Email Dad" });
  check(
    (await readFile(path, "utf8")) === "(A) Call Mom @phone\nEmail Dad\n",
    "node adapter: add() lands in the file",
  );

  await todos.complete((await todos.all())[0]);
  check(
    (await readFile(path, "utf8")).startsWith("x "),
    "node adapter: complete() lands in the file",
  );

  const entries = await readdir(dir);
  check(
    entries.length === 1 && entries[0] === "todo.txt",
    "node adapter: atomic writes leave no temp files",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("smoke ok: dist/node.mjs");
