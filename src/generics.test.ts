import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoRecord } from "./types.ts";

/**
 * Metadata with known keys. Declared as a type with an index signature,
 * since a plain interface would not satisfy the `TData` constraint.
 */
type TaskData = Record<string, string> & {
  due: string;
  rec: string;
};

describe("generic metadata typing", () => {
  test("createTodoTxt types data with the supplied TData", async () => {
    const todos = createTodoTxt<TaskData>({
      read: () => "(A) Pay taxes due:2026-04-15 rec:1y",
    });

    const first = await todos.first();
    expect(first?.data.due).toBe("2026-04-15");
    expect(first?.data.rec).toBe("1y");

    const all = await todos.all();
    expect(all[0]?.data.due).toBe("2026-04-15");

    const taxes = (await todos.meta("due")).at(0);
    expect(taxes?.data.rec).toBe("1y");

    const chained = await todos.pending().sortBy("priority").first();
    expect(chained?.data.due).toBe("2026-04-15");
  });

  test("TData is an assertion, not a validation", async () => {
    // A declared key can be missing at runtime; the type does not check
    // the file contents.
    const todos = createTodoTxt<TaskData>({
      read: () => "Task without tags",
    });

    expect((await todos.first())?.data.due).toBeUndefined();
  });

  test("TodoRecord<TData> can be written by hand", () => {
    const record: TodoRecord<TaskData> = {
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "Pay taxes",
      projects: [],
      contexts: [],
      data: { due: "2026-04-15", rec: "1y" },
    };

    expect(record.data.due).toBe("2026-04-15");
  });

  test("the default typing applies when TData is omitted", async () => {
    const todos = createTodoTxt({ read: () => "Task" });

    const first = await todos.first();

    // `data` is Record<string, string> again.
    expect(first?.data["due"]).toBeUndefined();
    expect(await todos.count()).toBe(1);
  });
});
