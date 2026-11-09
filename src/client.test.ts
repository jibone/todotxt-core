import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";

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
