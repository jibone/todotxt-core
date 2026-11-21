import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import { TodoReadError } from "./errors.ts";
import type { LogLevel, ParseWarning } from "./types.ts";

interface LogCall {
  level: LogLevel;
  message: string;
  meta: Record<string, unknown> | undefined;
}

describe("createTodoTxt", () => {
  test("reads through the hook and parses every line into JSON", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return "(A) Call Mom @phone\nx 2011-03-03 Done +Chores\n";
      },
      write: () => {},
    });

    const records = await todos.all();

    expect(readCalls).toBe(1);
    expect(records).toEqual([
      {
        completed: false,
        priority: "A",
        completedAt: null,
        createdAt: null,
        description: "Call Mom",
        projects: [],
        contexts: ["phone"],
        data: {},
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
      },
    ]);
  });

  test("supports asynchronous read hooks", async () => {
    const todos = createTodoTxt({
      read: async () => {
        await Promise.resolve();
        return "(B) Schedule pickup +GarageSale";
      },
      write: async () => {},
    });

    expect(await todos.all()).toEqual([
      {
        completed: false,
        priority: "B",
        completedAt: null,
        createdAt: null,
        description: "Schedule pickup",
        projects: ["GarageSale"],
        contexts: [],
        data: {},
      },
    ]);
  });

  test("calls the read hook on every all() call", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    const first = await todos.all();
    const second = await todos.all();

    expect(readCalls).toBe(2);
    expect(first[0]?.description).toBe("Task 1");
    expect(second[0]?.description).toBe("Task 2");
  });

  test("returns an empty array for an empty file", async () => {
    const todos = createTodoTxt({
      read: () => "",
      write: () => {},
    });

    expect(await todos.all()).toEqual([]);
  });

  test("does not call the write hook when reading", async () => {
    let writeCalls = 0;
    const todos = createTodoTxt({
      read: () => "Call Mom",
      write: () => {
        writeCalls += 1;
      },
    });

    await todos.all();
    await todos.pending();
    await todos.projects();

    expect(writeCalls).toBe(0);
  });

  test("allows read-only clients without a write hook", async () => {
    const todos = createTodoTxt({
      read: () => "Call Mom",
    });

    expect(await todos.all()).toHaveLength(1);
    expect(await todos.pending()).toHaveLength(1);
  });

  test("propagates errors from the read hook", async () => {
    const todos = createTodoTxt({
      read: () => {
        throw new Error("read failed");
      },
      write: () => {},
    });

    await expect(todos.all()).rejects.toThrow("read failed");
    await expect(Promise.resolve(todos.pending())).rejects.toThrow(
      "read failed",
    );
    await expect(todos.projects()).rejects.toThrow("read failed");
    await expect(todos.summary()).rejects.toThrow("read failed");
  });

  test("exposes root filters and plucks", async () => {
    const todos = createTodoTxt({
      read: () =>
        [
          "(A) Pending task +Alpha @home",
          "x 2024-01-02 Completed task +Beta @office",
        ].join("\n"),
      write: () => {},
    });

    expect((await todos.pending())[0]?.description).toBe("Pending task");
    expect((await todos.completed())[0]?.description).toBe("Completed task");
    expect((await todos.project("Alpha"))[0]?.description).toBe(
      "Pending task",
    );
    expect((await todos.context("office"))[0]?.description).toBe(
      "Completed task",
    );
    expect(await todos.projects()).toEqual(["Alpha", "Beta"]);
    expect(await todos.contexts()).toEqual(["home", "office"]);
  });

  test("exposes root summary and name counts", async () => {
    const todos = createTodoTxt({
      read: () =>
        [
          "(A) Pending task +Alpha @home",
          "x 2024-01-02 Completed task +Beta @office",
        ].join("\n"),
      write: () => {},
    });

    const summary = await todos.summary();

    expect(summary).toEqual({
      total: 2,
      pending: 1,
      completed: 1,
      projects: [
        { name: "Alpha", counts: { pending: 1, completed: 0, total: 1 } },
        { name: "Beta", counts: { pending: 0, completed: 1, total: 1 } },
      ],
      contexts: [
        { name: "home", counts: { pending: 1, completed: 0, total: 1 } },
        { name: "office", counts: { pending: 0, completed: 1, total: 1 } },
      ],
    });

    expect(await todos.countsByProject()).toEqual(summary.projects);
    expect(await todos.countsByContext()).toEqual(summary.contexts);
  });

  test("all() is a terminal Promise", () => {
    const todos = createTodoTxt({
      read: () => "Call Mom",
      write: () => {},
    });

    expect(todos.all()).toBeInstanceOf(Promise);
  });
});

describe("in-memory cache", () => {
  test("reads once across queries on the same client", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return [
          "(A) Pending task +Alpha @home",
          "x 2024-01-02 Completed task +Beta @office",
        ].join("\n");
      },
      write: () => {},
    });

    await todos.pending();
    await todos.completed();
    await todos.projects();
    await todos.contexts();
    await todos.summary();
    await todos.countsByProject();
    await todos.countsByContext();
    await todos.project("Alpha").completed();
    await todos.context("office").pending();

    expect(readCalls).toBe(1);
  });

  test("all() refreshes the cache", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    const first = await todos.pending();

    expect(first[0]?.description).toBe("Task 1");
    expect(readCalls).toBe(1);

    const reloaded = await todos.all();

    expect(reloaded[0]?.description).toBe("Task 2");
    expect(readCalls).toBe(2);

    const cached = await todos.pending();

    expect(cached[0]?.description).toBe("Task 2");
    expect(readCalls).toBe(2);
  });

  test("returns copies so callers cannot mutate the cache", async () => {
    const todos = createTodoTxt({
      read: () => "Call Mom +Family due:2011-03-05",
      write: () => {},
    });

    const first = await todos.all();
    first[0]!.description = "Changed";
    first[0]!.projects.push("Other");
    first[0]!.data.due = "2099-01-01";

    const second = await todos.pending();

    expect(second[0]?.description).toBe("Call Mom");
    expect(second[0]?.projects).toEqual(["Family"]);
    expect(second[0]?.data).toEqual({ due: "2011-03-05" });
    expect(second[0]).not.toBe(first[0]);
  });

  test("does not cache failed reads", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;

        if (readCalls === 1) {
          throw new Error("read failed");
        }

        return "Recovered";
      },
      write: () => {},
    });

    await expect(Promise.resolve(todos.pending())).rejects.toThrow(
      "read failed",
    );

    const records = await todos.pending();

    expect(records[0]?.description).toBe("Recovered");
    expect(readCalls).toBe(2);
  });

  test("shares one read between concurrent first queries", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCalls += 1;
        await Promise.resolve();
        return "Shared task";
      },
      write: () => {},
    });

    const [pending, completed] = await Promise.all([
      todos.pending(),
      todos.completed(),
    ]);

    expect(pending).toHaveLength(1);
    expect(completed).toHaveLength(0);
    expect(readCalls).toBe(1);
  });
});

describe("cache lifecycle", () => {
  test("refresh() returns fresh records and updates the cache", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    const first = await todos.pending();
    expect(first[0]?.description).toBe("Task 1");
    expect(readCalls).toBe(1);

    const refreshed = await todos.refresh();

    expect(refreshed[0]?.description).toBe("Task 2");
    expect(readCalls).toBe(2);

    const cached = await todos.pending();

    expect(cached[0]?.description).toBe("Task 2");
    expect(readCalls).toBe(2);
  });

  test("invalidate() followed by a query triggers exactly one new read", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    await todos.pending();
    expect(readCalls).toBe(1);

    todos.invalidate();

    const reread = await todos.pending();

    expect(reread[0]?.description).toBe("Task 2");
    expect(readCalls).toBe(2);

    const cached = await todos.completed();

    expect(cached).toEqual([]);
    expect(readCalls).toBe(2);
  });

  test("invalidate() resets warnings until the next read repopulates them", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return readCalls % 2 === 1 ? "Task due:a due:b" : "Clean task";
      },
    });

    await todos.pending();
    expect(todos.warnings()).toHaveLength(1);

    todos.invalidate();
    expect(todos.warnings()).toEqual([]);

    await todos.pending();
    expect(readCalls).toBe(2);
    expect(todos.warnings()).toEqual([]);

    await todos.refresh();
    expect(readCalls).toBe(3);
    expect(todos.warnings()).toHaveLength(1);
  });

  test("refresh() returns copies that cannot mutate the cache", async () => {
    const todos = createTodoTxt({
      read: () => "Call Mom +Family due:2011-03-05",
      write: () => {},
    });

    const refreshed = await todos.refresh();
    refreshed[0]!.description = "Changed";
    refreshed[0]!.projects.push("Other");
    refreshed[0]!.data.due = "2099-01-01";

    const cached = await todos.pending();

    expect(cached[0]?.description).toBe("Call Mom");
    expect(cached[0]?.projects).toEqual(["Family"]);
    expect(cached[0]?.data).toEqual({ due: "2011-03-05" });
    expect(cached[0]).not.toBe(refreshed[0]);
  });

  test("concurrent queries during a refresh() share one read", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCalls += 1;
        await Promise.resolve();
        return "Shared task";
      },
      write: () => {},
    });

    const [refreshed, pending, completed] = await Promise.all([
      todos.refresh(),
      todos.pending(),
      todos.completed(),
    ]);

    expect(refreshed).toHaveLength(1);
    expect(pending).toHaveLength(1);
    expect(completed).toHaveLength(0);
    expect(readCalls).toBe(1);
  });

  test("concurrent queries after invalidate() share one new read", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCalls += 1;
        await Promise.resolve();
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    await todos.pending();
    expect(readCalls).toBe(1);

    todos.invalidate();

    const [pending, completed] = await Promise.all([
      todos.pending(),
      todos.completed(),
    ]);

    expect(pending[0]?.description).toBe("Task 2");
    expect(completed).toEqual([]);
    expect(readCalls).toBe(2);
  });

  test("a read that resolves after invalidate() cannot overwrite newer state", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCalls += 1;
        if (readCalls === 1) {
          // The first read is slower than the read that replaces it.
          await Promise.resolve();
          await Promise.resolve();
          return "Stale task due:a due:b";
        }
        return "Fresh task";
      },
      write: () => {},
    });

    const stale = todos.all(); // read 1, in flight
    todos.invalidate(); // orphans it

    const fresh = await todos.all(); // read 2, faster
    const staleRecords = await stale;

    expect(fresh[0]?.description).toBe("Fresh task");
    expect(staleRecords[0]?.description).toBe("Stale task");
    // The stale read carries a duplicate-key warning that must never land.
    expect(todos.warnings()).toEqual([]);

    const cached = await todos.pending();

    expect(cached[0]?.description).toBe("Fresh task");
    expect(readCalls).toBe(2);
  });

  test("a query started before invalidate() resolves with the old snapshot", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCalls += 1;
        if (readCalls === 1) {
          await Promise.resolve();
          return "First task";
        }
        return "Second task";
      },
      write: () => {},
    });

    const started = Promise.resolve(todos.pending());
    await Promise.resolve(); // the lazy query has now started its read
    todos.invalidate();

    const records = await started;

    expect(records[0]?.description).toBe("First task");

    const reread = await todos.pending();

    expect(reread[0]?.description).toBe("Second task");
    expect(readCalls).toBe(2);
  });

  test("invalidate() before the first read only delays it", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return "Task";
      },
      write: () => {},
    });

    todos.invalidate();
    expect(todos.warnings()).toEqual([]);

    await todos.pending();
    await todos.projects();

    expect(readCalls).toBe(1);
  });

  test("a failed refresh() leaves the previous cache in place", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        if (readCalls === 2) {
          throw new Error("read failed");
        }
        return "Stable task";
      },
      write: () => {},
    });

    await todos.pending();
    expect(readCalls).toBe(1);

    await expect(todos.refresh()).rejects.toThrow("read failed");
    expect(readCalls).toBe(2);

    const cached = await todos.pending();

    expect(cached[0]?.description).toBe("Stable task");
    expect(readCalls).toBe(2);
  });
});

describe("includeSource", () => {
  test("adds line and raw to every record", async () => {
    const todos = createTodoTxt({
      read: () => "(A) Call Mom @phone\n\nx 2011-03-03 Done +Chores\n",
      includeSource: true,
    });

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
        raw: "(A) Call Mom @phone",
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
        line: 3,
        raw: "x 2011-03-03 Done +Chores",
      },
    ]);
  });

  test("records omit source fields by default", async () => {
    const todos = createTodoTxt({
      read: () => "(A) Call Mom",
      write: () => {},
    });

    const records = await todos.all();

    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty("line");
    expect(records[0]).not.toHaveProperty("raw");
  });

  test("queries preserve line and raw", async () => {
    const todos = createTodoTxt({
      read: () =>
        [
          "(A) Call Mom +Family @phone",
          "x 2011-03-03 Done +Chores",
          "(B) Schedule Goodwill pickup +GarageSale",
        ].join("\n"),
      includeSource: true,
    });

    const pending = await todos.pending();

    expect(pending.map((record) => record.line)).toEqual([1, 3]);
    expect(pending.map((record) => record.raw)).toEqual([
      "(A) Call Mom +Family @phone",
      "(B) Schedule Goodwill pickup +GarageSale",
    ]);

    expect((await todos.completed())[0]).toMatchObject({
      line: 2,
      raw: "x 2011-03-03 Done +Chores",
    });
    expect((await todos.project("GarageSale"))[0]).toMatchObject({ line: 3 });
    expect((await todos.context("phone"))[0]).toMatchObject({ line: 1 });
  });

  test("source fields on returned records cannot mutate the cache", async () => {
    const todos = createTodoTxt({
      read: () => "(A) Call Mom",
      includeSource: true,
    });

    const first = await todos.all();
    first[0]!.line = 99;
    first[0]!.raw = "tampered";

    const second = await todos.pending();

    expect(second[0]?.line).toBe(1);
    expect(second[0]?.raw).toBe("(A) Call Mom");
  });
});

describe("warnings()", () => {
  test("is empty before the first read", () => {
    const todos = createTodoTxt({
      read: () => "Task",
    });

    expect(todos.warnings()).toEqual([]);
  });

  test("exposes the most recent read's warnings in document order", async () => {
    const todos = createTodoTxt({
      read: () =>
        ["(A) First", "", "Task due:a due:b", "2011-99-99 Bad date"].join("\n"),
    });

    await todos.all();

    expect(
      todos.warnings().map((warning) => [warning.code, warning.line]),
    ).toEqual([
      ["duplicate-metadata-key", 3],
      ["invalid-date", 4],
    ]);
  });

  test("populates from the first lazy query read", async () => {
    const todos = createTodoTxt({
      read: () => "Task due:a due:b",
    });

    await todos.pending();

    expect(todos.warnings()).toHaveLength(1);
  });

  test("is empty again after a clean read", async () => {
    let readCount = 0;
    const todos = createTodoTxt({
      read: () => {
        readCount += 1;
        return readCount === 1 ? "Task due:a due:b" : "Clean task";
      },
    });

    await todos.all();
    expect(todos.warnings()).toHaveLength(1);

    await todos.all();
    expect(todos.warnings()).toEqual([]);
  });

  test("keeps the previous warnings when a read fails", async () => {
    let readCount = 0;
    const todos = createTodoTxt({
      read: () => {
        readCount += 1;
        if (readCount === 2) {
          throw new Error("read failed");
        }
        return "Task due:a due:b";
      },
    });

    await todos.all();
    expect(todos.warnings()).toHaveLength(1);

    await expect(todos.all()).rejects.toThrow("read failed");
    expect(todos.warnings()).toHaveLength(1);
  });

  test("returns copies that cannot mutate the stored warnings", async () => {
    const todos = createTodoTxt({
      read: () => "Task due:a due:b",
    });

    await todos.all();

    const warnings = todos.warnings();
    warnings.push({ code: "invalid-date", message: "fake", meta: {} });
    warnings[0]!.message = "tampered";
    warnings[0]!.meta.key = "tampered";

    const fresh = todos.warnings();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.message).toBe(
      'Duplicate metadata key "due"; the last value wins.',
    );
    expect(fresh[0]?.meta).toEqual({
      key: "due",
      previousValue: "a",
      value: "b",
    });
  });

  test("a superseded read cannot overwrite the newest warnings", async () => {
    let readCount = 0;
    const todos = createTodoTxt({
      read: async () => {
        readCount += 1;
        if (readCount === 1) {
          await Promise.resolve();
          return "Task due:a due:b";
        }
        return "Clean task";
      },
    });

    const stale = todos.all();
    await todos.all();
    await stale;

    expect(todos.warnings()).toEqual([]);
  });

  test("the logger still receives warnings alongside warnings()", async () => {
    const calls: LogCall[] = [];
    const todos = createTodoTxt({
      read: () => "Task due:a due:b",
      logger: (level, message, meta) => {
        calls.push({ level, message, meta });
      },
    });

    await todos.all();

    const warnCalls = calls.filter((call) => call.level === "warn");
    expect(warnCalls).toHaveLength(1);
    expect(todos.warnings()).toHaveLength(1);
    expect(warnCalls[0]?.message).toBe(todos.warnings()[0]?.message);
  });
});

describe("logger", () => {
  test("is silent by default", async () => {
    const todos = createTodoTxt({
      read: () => "Task due:2010-01-02 due:2010-02-02",
    });

    const records = await todos.all();

    expect(records[0]?.data).toEqual({ due: "2010-02-02" });
  });

  test("logs the read lifecycle and duplicate metadata warnings", async () => {
    const calls: LogCall[] = [];
    const todos = createTodoTxt({
      read: () => ["Task due:2010-01-02 due:2010-02-02", "Other"].join("\n"),
      logger: (level, message, meta) => {
        calls.push({ level, message, meta });
      },
    });

    const records = await todos.all();

    expect(records[0]?.data).toEqual({ due: "2010-02-02" });
    expect(calls.map((call) => call.level)).toEqual([
      "debug",
      "warn",
      "debug",
    ]);
    expect(calls[0]?.message).toBe("Reading todo file");
    expect(calls[1]?.message).toBe(
      'Duplicate metadata key "due"; the last value wins.',
    );
    expect(calls[1]?.meta).toMatchObject({
      code: "duplicate-metadata-key",
      line: 1,
      key: "due",
      previousValue: "2010-01-02",
      value: "2010-02-02",
    });
    expect(calls[2]?.message).toBe("Parsed todo file");
    expect(calls[2]?.meta).toEqual({ records: 2 });
  });

  test("reports the physical line number of a duplicate key", async () => {
    const warnings: ParseWarning[] = [];
    const todos = createTodoTxt({
      read: () => ["First", "", "Task due:a due:b"].join("\n"),
      logger: (level, message, meta) => {
        if (level === "warn") {
          warnings.push({
            code: "duplicate-metadata-key",
            message,
            line: meta?.line as number | undefined,
            meta: meta ?? {},
          });
        }
      },
    });

    await todos.all();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(3);
  });

  test("does not warn about unique metadata keys", async () => {
    const calls: LogCall[] = [];
    const todos = createTodoTxt({
      read: () => "Task due:2010-01-02 rec:1w",
      logger: (level, message, meta) => {
        calls.push({ level, message, meta });
      },
    });

    await todos.all();

    expect(calls.filter((call) => call.level === "warn")).toHaveLength(0);
  });

  test("does not log again when a query uses the cache", async () => {
    const calls: LogCall[] = [];
    const todos = createTodoTxt({
      read: () => "Task",
      logger: (level, message, meta) => {
        calls.push({ level, message, meta });
      },
    });

    await todos.pending();
    await todos.pending();
    await todos.projects();

    expect(calls.map((call) => call.level)).toEqual(["debug", "debug"]);
  });

  test("propagates read errors without logging them as errors", async () => {
    const calls: LogCall[] = [];
    const todos = createTodoTxt({
      read: () => {
        throw new Error("read failed");
      },
      logger: (level, message, meta) => {
        calls.push({ level, message, meta });
      },
    });

    await expect(todos.all()).rejects.toThrow("read failed");
    expect(calls.map((call) => call.level)).toEqual(["debug"]);
  });

  test("ignores a throwing logger", async () => {
    const todos = createTodoTxt({
      read: () => "Task",
      logger: () => {
        throw new Error("logger failed");
      },
    });

    expect(await todos.all()).toHaveLength(1);
  });

  test("ignores a logger that rejects asynchronously", async () => {
    const todos = createTodoTxt({
      read: () => "Task",
      logger: async () => {
        throw new Error("logger failed");
      },
    });

    expect(await todos.all()).toHaveLength(1);
  });
});

describe("read errors", () => {
  const capture = async (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => new Error("expected the read to fail"),
      (error: unknown) => error,
    );

  test("wraps a rejected string in TodoReadError", async () => {
    const todos = createTodoTxt({
      read: () => Promise.reject("not found"),
    });

    const failure = await capture(todos.all());

    expect(failure).toBeInstanceOf(TodoReadError);
    expect(failure).toBeInstanceOf(Error);
    const error = failure as TodoReadError;
    expect(error.name).toBe("TodoReadError");
    expect(error.message).toBe(
      "The read hook rejected with a non-Error value.",
    );
    expect(error.cause).toBe("not found");
  });

  test("wraps a rejected plain object and keeps it on cause", async () => {
    const rejection = { code: 42, detail: "garage door open" };
    const todos = createTodoTxt({
      read: () => Promise.reject(rejection),
    });

    const failure = await capture(todos.all());

    expect(failure).toBeInstanceOf(TodoReadError);
    expect((failure as TodoReadError).cause).toBe(rejection);
  });

  test("wraps values thrown synchronously by the read hook", async () => {
    const todos = createTodoTxt({
      read: () => {
        throw "sync blow-up";
      },
    });

    const failure = await capture(todos.all());

    expect(failure).toBeInstanceOf(TodoReadError);
    expect((failure as TodoReadError).cause).toBe("sync blow-up");
  });

  test("propagates Error rejections untouched", async () => {
    const readError = Object.assign(new Error("no such file"), {
      code: "ENOENT",
    });
    const todos = createTodoTxt({
      read: () => Promise.reject(readError),
    });

    const failure = await capture(todos.all());

    expect(failure).toBe(readError);
    expect(failure).not.toBeInstanceOf(TodoReadError);
    expect((failure as { code?: string }).code).toBe("ENOENT");
  });

  test("lazy queries wrap non-Error rejections too", async () => {
    const todos = createTodoTxt({
      read: () => Promise.reject("nope"),
    });

    const failure = await capture(Promise.resolve(todos.pending()));

    expect(failure).toBeInstanceOf(TodoReadError);
  });

  test("a failed non-Error read leaves the previous warnings in place", async () => {
    let readCount = 0;
    const todos = createTodoTxt({
      read: () => {
        readCount += 1;
        return readCount === 1 ? "Task due:a due:b" : Promise.reject("gone");
      },
    });

    await todos.all();
    expect(todos.warnings()).toHaveLength(1);

    const failure = await capture(todos.all());
    expect(failure).toBeInstanceOf(TodoReadError);
    expect(todos.warnings()).toHaveLength(1);
  });
});
