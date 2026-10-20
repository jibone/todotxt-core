import { describe, expect, test } from "bun:test";
import { parseLine } from "./parse.ts";
import { toTodoRecord } from "./record.ts";

describe("toTodoRecord", () => {
  test("maps a full todo item", () => {
    expect(
      toTodoRecord(
        parseLine("(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05"),
      ),
    ).toEqual({
      completed: false,
      priority: "A",
      completedAt: null,
      createdAt: "2011-03-02",
      description: "Call Mom",
      projects: ["Family"],
      contexts: ["phone"],
      data: { due: "2011-03-05" },
    });
  });

  test("maps a completed task", () => {
    expect(
      toTodoRecord(
        parseLine(
          "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
        ),
      ),
    ).toEqual({
      completed: true,
      priority: null,
      completedAt: "2011-03-03",
      createdAt: "2011-03-01",
      description: "Review Tim's pull request",
      projects: ["TodoTxtTouch"],
      contexts: ["github"],
      data: {},
    });
  });

  test("defaults missing fields to null and empty collections", () => {
    expect(toTodoRecord(parseLine("Call Mom"))).toEqual({
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "Call Mom",
      projects: [],
      contexts: [],
      data: {},
    });
  });

  test("keeps non-metadata tokens in the description", () => {
    const record = toTodoRecord(
      parseLine("Email SoAndSo at soandso@example.com about 2+2"),
    );

    expect(record.description).toBe(
      "Email SoAndSo at soandso@example.com about 2+2",
    );
    expect(record.projects).toEqual([]);
    expect(record.contexts).toEqual([]);
  });

  test("keeps malformed extensions in the description", () => {
    const record = toTodoRecord(parseLine("Task foo:bar:baz"));

    expect(record.description).toBe("Task foo:bar:baz");
    expect(record.data).toEqual({});
  });

  test("uses the last value for a repeated extension", () => {
    const record = toTodoRecord(
      parseLine("Task due:2010-01-02 due:2010-02-02"),
    );

    expect(record.description).toBe("Task");
    expect(record.data).toEqual({ due: "2010-02-02" });
  });

  test("normalizes whitespace left behind by removed metadata", () => {
    const record = toTodoRecord(parseLine("(A)   Call   Mom   +Family"));

    expect(record.description).toBe("Call Mom");
  });

  test("allows an empty description when only metadata is present", () => {
    const record = toTodoRecord(parseLine("+Family @phone"));

    expect(record.description).toBe("");
    expect(record.projects).toEqual(["Family"]);
    expect(record.contexts).toEqual(["phone"]);
  });
});
