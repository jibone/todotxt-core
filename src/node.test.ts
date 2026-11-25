import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TodoReadError } from "./errors.ts";
import { TodoWriteError } from "./errors.ts";
import { createNodeTodoTxt } from "./node.ts";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "todotxt-core-node-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeTodoFile(name: string, contents: string): Promise<string> {
  const path = join(tempDir, name);
  await writeFile(path, contents);
  return path;
}

const capture = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error) => error,
  );

describe("createNodeTodoTxt", () => {
  test("reads a todo.txt file through node:fs/promises", async () => {
    const path = await writeTodoFile(
      "basic.txt",
      "(A) Call Mom @phone\nx 2011-03-03 Done +Chores\n",
    );

    // The adapter supplies the write hook, so the client is write-enabled
    // and its records always carry `line`.
    const todos = createNodeTodoTxt(path);

    expect(await todos.all()).toEqual([
      {
        completed: false,
        priority: "A",
        completedAt: null,
        createdAt: null,
        description: "Call Mom",
        projects: [],
        contexts: ["phone"],
        data: {},
        line: 1,
      },
      {
        completed: true,
        priority: null,
        completedAt: "2011-03-03",
        createdAt: null,
        description: "Done",
        projects: ["Chores"],
        contexts: [],
        data: {},
        line: 2,
      },
    ]);

    expect(await todos.pending().count()).toBe(1);
    expect(await todos.completed().count()).toBe(1);
  });

  test("propagates filesystem errors untouched", async () => {
    const todos = createNodeTodoTxt(join(tempDir, "missing.txt"));

    const failure = await capture(todos.all());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TodoReadError);
    expect((failure as { code?: string }).code).toBe("ENOENT");
  });

  test("reads files with a custom encoding", async () => {
    const path = join(tempDir, "latin1.txt");
    await writeFile(path, "Rendez-vous au café", { encoding: "latin1" });

    const todos = createNodeTodoTxt(path, { encoding: "latin1" });

    expect((await todos.first())?.description).toBe("Rendez-vous au café");
  });

  test("forwards includeSource", async () => {
    const path = await writeTodoFile("source.txt", "First\n\n(A) Second +p");

    const todos = createNodeTodoTxt(path, { includeSource: true });

    expect((await todos.all())[1]?.line).toBe(3);
    expect((await todos.all())[1]?.raw).toBe("(A) Second +p");
    expect((await todos.project("p").first())?.line).toBe(3);
  });

  test("forwards caseSensitive: false", async () => {
    const path = await writeTodoFile("case.txt", "Call the plumber +Garden");

    const todos = createNodeTodoTxt(path, { caseSensitive: false });

    expect(await todos.project("garden").count()).toBe(1);
  });

  test("forwards the logger", async () => {
    const path = await writeTodoFile("warn.txt", "2011-99-99 Broken date");

    const entries: Array<{ level: string; message: string }> = [];
    const todos = createNodeTodoTxt(path, {
      logger: (level, message) => {
        entries.push({ level, message });
      },
    });

    await todos.all();

    expect(entries.some((entry) => entry.level === "debug")).toBe(true);
    expect(entries.some((entry) => entry.level === "warn")).toBe(true);
  });

  test("accepts a URL as the path", async () => {
    const path = await writeTodoFile("url.txt", "Call Mom");

    const todos = createNodeTodoTxt(new URL(`file://${path}`));

    expect(await todos.count()).toBe(1);
  });

  test("supports typed metadata through TData", async () => {
    const path = await writeTodoFile(
      "typed.txt",
      "(A) Pay taxes due:2026-04-15 rec:1y",
    );

    type TaskData = Record<string, string> & { due: string; rec: string };
    const todos = createNodeTodoTxt<TaskData>(path);

    const first = await todos.first();
    expect(first?.data.due).toBe("2026-04-15");
    expect(first?.data.rec).toBe("1y");

    const chained = await todos.pending().sortBy("priority").first();
    expect(chained?.data.due).toBe("2026-04-15");
  });

  test("writes through node:fs/promises", async () => {
    const path = await writeTodoFile("write.txt", "(A) Call Mom\n");

    const todos = createNodeTodoTxt(path);
    const added = await todos.add({
      description: "Email Dad",
      projects: ["Family"],
    });

    expect(await readFile(path, "utf8")).toBe(
      "(A) Call Mom\nEmail Dad +Family\n",
    );
    expect(added.line).toBe(2);
  });

  test("writes atomically and leaves no temp files behind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "todotxt-core-atomic-"));
    const path = join(dir, "atomic.txt");
    await writeFile(path, "Call Mom\n");

    try {
      const todos = createNodeTodoTxt(path);
      await todos.add({ description: "Email Dad" });

      expect(await readFile(path, "utf8")).toBe("Call Mom\nEmail Dad\n");
      expect(await readdir(dir)).toEqual(["atomic.txt"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("preserves the target file's mode across writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "todotxt-core-mode-"));
    const path = join(dir, "todo.txt");
    await writeFile(path, "Call Mom\n");
    // A mode the default umask would not produce, so the assertion can
    // tell preservation from a freshly created temp file's mode.
    await chmod(path, 0o604);

    try {
      const todos = createNodeTodoTxt(path);
      await todos.complete((await todos.all())[0]!);

      const { mode } = await stat(path);
      expect(mode & 0o777).toBe(0o604);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("writes through a URL as the path", async () => {
    const path = await writeTodoFile("url-write.txt", "Call Mom\n");

    const todos = createNodeTodoTxt(new URL(`file://${path}`));
    await todos.add({ description: "Email Dad" });

    expect(await readFile(path, "utf8")).toBe("Call Mom\nEmail Dad\n");
  });

  test("a failed write leaves no temp files and propagates the fs error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "todotxt-core-fail-"));
    const path = join(dir, "todo.txt");
    await writeFile(path, "Call Mom\n");

    const todos = createNodeTodoTxt(path);

    try {
      // No write permission in the directory: the read-modify-write's
      // read still succeeds, but the temp file cannot be created.
      await chmod(dir, 0o555);

      const failure = await capture(todos.add({ description: "Task" }));

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(TodoWriteError);
      expect((failure as { code?: string }).code).toBe("EACCES");
      expect(await readdir(dir)).toEqual(["todo.txt"]);
    } finally {
      await chmod(dir, 0o700);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("forwards the today option", async () => {
    const path = await writeTodoFile("today.txt", "Call Mom\n");

    const todos = createNodeTodoTxt(path, { today: () => "2011-03-03" });

    const done = await todos.complete((await todos.all())[0]!);

    expect(done.completedAt).toBe("2011-03-03");
    expect(await readFile(path, "utf8")).toBe("x 2011-03-03 Call Mom\n");
  });

  test("propagates filesystem write errors untouched", async () => {
    const todos = createNodeTodoTxt(join(tempDir, "missing-dir", "todo.txt"));

    const failure = await capture(todos.add({ description: "Task" }));

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TodoWriteError);
    expect((failure as { code?: string }).code).toBe("ENOENT");
  });
});
