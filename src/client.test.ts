import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";

describe("createTodoTxt", () => {
  test("reads through the hook and parses the contents", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return "(A) Call Mom @phone\nx 2011-03-03 Done +Chores\n";
      },
      write: () => {},
    });

    const items = await todos.read();

    expect(readCalls).toBe(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      priority: "A",
      text: "Call Mom @phone",
      contexts: ["phone"],
    });
    expect(items[1]).toMatchObject({
      completed: true,
      text: "Done +Chores",
      projects: ["Chores"],
    });
  });

  test("supports asynchronous read hooks", async () => {
    const todos = createTodoTxt({
      read: async () => {
        await Promise.resolve();
        return "(B) Schedule pickup +GarageSale";
      },
      write: async () => {},
    });

    const items = await todos.read();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      priority: "B",
      text: "Schedule pickup +GarageSale",
      projects: ["GarageSale"],
    });
  });

  test("calls the read hook on every read", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return `Task ${readCalls}`;
      },
      write: () => {},
    });

    const first = await todos.read();
    const second = await todos.read();

    expect(readCalls).toBe(2);
    expect(first[0]?.text).toBe("Task 1");
    expect(second[0]?.text).toBe("Task 2");
  });

  test("returns an empty array for an empty file", async () => {
    const todos = createTodoTxt({
      read: () => "",
      write: () => {},
    });

    expect(await todos.read()).toEqual([]);
  });

  test("does not call the write hook when reading", async () => {
    let writeCalls = 0;
    const todos = createTodoTxt({
      read: () => "Call Mom",
      write: () => {
        writeCalls += 1;
      },
    });

    await todos.read();

    expect(writeCalls).toBe(0);
  });

  test("propagates errors from the read hook", async () => {
    const todos = createTodoTxt({
      read: () => {
        throw new Error("read failed");
      },
      write: () => {},
    });

    await expect(todos.read()).rejects.toThrow("read failed");
  });
});
