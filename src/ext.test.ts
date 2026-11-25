import { describe, expect, test } from "bun:test";
import {
  dueDate,
  effectivePriority,
  isDueToday,
  isDueWithin,
  isOverdue,
} from "./ext.ts";
import type { TodoRecord } from "./types.ts";

function record(overrides: Partial<TodoRecord> = {}): TodoRecord {
  return {
    completed: false,
    priority: null,
    completedAt: null,
    createdAt: null,
    description: "Task",
    projects: [],
    contexts: [],
    data: {},
    ...overrides,
  };
}

describe("dueDate", () => {
  test("returns data.due when it is a real calendar date", () => {
    expect(dueDate(record({ data: { due: "2024-04-01" } }))).toBe(
      "2024-04-01",
    );
  });

  test("returns null when the key is missing or empty", () => {
    expect(dueDate(record())).toBeNull();
    expect(dueDate(record({ data: { due: "" } }))).toBeNull();
    expect(dueDate(record({ data: { rec: "1w" } }))).toBeNull();
  });

  test("returns null for invalid values, applying leap year rules", () => {
    expect(dueDate(record({ data: { due: "2024-02-29" } }))).toBe(
      "2024-02-29",
    );
    expect(dueDate(record({ data: { due: "2023-02-29" } }))).toBeNull();
    expect(dueDate(record({ data: { due: "2024-02-30" } }))).toBeNull();
    expect(dueDate(record({ data: { due: "2024-13-01" } }))).toBeNull();
    expect(dueDate(record({ data: { due: "not-a-date" } }))).toBeNull();
  });

  test("ignores inherited due keys", () => {
    const data = Object.create({ due: "2024-04-01" }) as Record<
      string,
      string
    >;
    expect(dueDate(record({ data }))).toBeNull();
  });

  test("reads completed records too", () => {
    const todo = record({
      completed: true,
      data: { due: "2024-03-31" },
    });
    expect(dueDate(todo)).toBe("2024-03-31");
  });
});

describe("effectivePriority", () => {
  test("prefers the record's own priority", () => {
    expect(
      effectivePriority(record({ priority: "A", data: { pri: "C" } })),
    ).toBe("A");
  });

  test("falls back to the pri: convention when priority is null", () => {
    expect(effectivePriority(record({ data: { pri: "C" } }))).toBe("C");
  });

  test("returns the pri: value as-is, without a shape check", () => {
    expect(effectivePriority(record({ data: { pri: "low" } }))).toBe("low");
  });

  test("returns null when both are absent", () => {
    expect(effectivePriority(record())).toBeNull();
  });

  test("ignores inherited pri keys", () => {
    const data = Object.create({ pri: "A" }) as Record<string, string>;
    expect(effectivePriority(record({ data }))).toBeNull();
  });

  test("reads completed records too", () => {
    const todo = record({ completed: true, data: { pri: "A" } });
    expect(effectivePriority(todo)).toBe("A");
  });
});

describe("isOverdue", () => {
  test("is true for a pending record due strictly before today", () => {
    expect(
      isOverdue(record({ data: { due: "2024-03-31" } }), "2024-04-01"),
    ).toBe(true);
  });

  test("is false when due exactly today", () => {
    expect(
      isOverdue(record({ data: { due: "2024-04-01" } }), "2024-04-01"),
    ).toBe(false);
  });

  test("is false for completed records with a past due date", () => {
    const todo = record({
      completed: true,
      completedAt: "2024-04-01",
      data: { due: "2024-03-31" },
    });
    expect(isOverdue(todo, "2024-04-01")).toBe(false);
  });

  test("is false for missing or invalid due values", () => {
    expect(isOverdue(record(), "2024-04-01")).toBe(false);
    expect(
      isOverdue(record({ data: { due: "not-a-date" } }), "2024-04-01"),
    ).toBe(false);
  });

  test("throws TypeError for an invalid today", () => {
    expect(() => isOverdue(record(), "2024-99-99")).toThrow(TypeError);
    expect(() => isOverdue(record(), "today")).toThrow(
      'isOverdue() expected today to be a real YYYY-MM-DD date, got "today".',
    );
  });
});

describe("isDueToday", () => {
  test("is true when due equals today", () => {
    expect(
      isDueToday(record({ data: { due: "2024-04-01" } }), "2024-04-01"),
    ).toBe(true);
  });

  test("is false when due differs by a day", () => {
    expect(
      isDueToday(record({ data: { due: "2024-03-31" } }), "2024-04-01"),
    ).toBe(false);
    expect(
      isDueToday(record({ data: { due: "2024-04-02" } }), "2024-04-01"),
    ).toBe(false);
  });

  test("is false for completed records and missing or invalid due values", () => {
    const todo = record({
      completed: true,
      completedAt: "2024-04-01",
      data: { due: "2024-04-01" },
    });
    expect(isDueToday(todo, "2024-04-01")).toBe(false);
    expect(isDueToday(record(), "2024-04-01")).toBe(false);
    expect(
      isDueToday(record({ data: { due: "not-a-date" } }), "2024-04-01"),
    ).toBe(false);
  });

  test("throws TypeError for an invalid today", () => {
    expect(() => isDueToday(record(), "")).toThrow(TypeError);
  });
});

describe("isDueWithin", () => {
  test("is true at both window edges, false just outside", () => {
    // Window: [2024-04-01, 2024-04-08].
    expect(
      isDueWithin(record({ data: { due: "2024-04-01" } }), 7, "2024-04-01"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2024-04-08" } }), 7, "2024-04-01"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2024-04-09" } }), 7, "2024-04-01"),
    ).toBe(false);
  });

  test("is forward-only: a due date before today never matches", () => {
    expect(
      isDueWithin(record({ data: { due: "2024-03-31" } }), 7, "2024-04-01"),
    ).toBe(false);
  });

  test("days of 0 is exactly isDueToday", () => {
    expect(
      isDueWithin(record({ data: { due: "2024-04-01" } }), 0, "2024-04-01"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2024-04-02" } }), 0, "2024-04-01"),
    ).toBe(false);
  });

  test("crosses leap-day windows", () => {
    // 2024 is a leap year: 2024-02-28 + 2 days reaches 2024-03-01.
    expect(
      isDueWithin(record({ data: { due: "2024-02-29" } }), 1, "2024-02-28"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2024-03-01" } }), 2, "2024-02-28"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2024-03-02" } }), 2, "2024-02-28"),
    ).toBe(false);

    // 2023 is not: 2023-02-28 + 1 day is 2023-03-01.
    expect(
      isDueWithin(record({ data: { due: "2023-03-01" } }), 1, "2023-02-28"),
    ).toBe(true);
  });

  test("crosses year boundaries", () => {
    expect(
      isDueWithin(record({ data: { due: "2025-01-01" } }), 1, "2024-12-31"),
    ).toBe(true);
    expect(
      isDueWithin(record({ data: { due: "2025-01-02" } }), 1, "2024-12-31"),
    ).toBe(false);
  });

  test("compares numerically when the window end passes year 9999", () => {
    // Millions of days push the end year past 9999, whose string form
    // would no longer compare with due's four digits.
    expect(
      isDueWithin(
        record({ data: { due: "9999-12-31" } }),
        3_000_000,
        "2024-01-01",
      ),
    ).toBe(true);
    expect(
      isDueWithin(
        record({ data: { due: "9999-12-31" } }),
        2_000_000,
        "2024-01-01",
      ),
    ).toBe(false);
  });

  test("is false for completed records and missing or invalid due values", () => {
    const todo = record({
      completed: true,
      completedAt: "2024-04-01",
      data: { due: "2024-04-02" },
    });
    expect(isDueWithin(todo, 7, "2024-04-01")).toBe(false);
    expect(isDueWithin(record(), 7, "2024-04-01")).toBe(false);
    expect(
      isDueWithin(record({ data: { due: "not-a-date" } }), 7, "2024-04-01"),
    ).toBe(false);
  });

  test("throws TypeError for a negative or fractional days", () => {
    expect(() => isDueWithin(record(), -1, "2024-04-01")).toThrow(TypeError);
    expect(() => isDueWithin(record(), 1.5, "2024-04-01")).toThrow(TypeError);
    expect(() => isDueWithin(record(), Number.NaN, "2024-04-01")).toThrow(
      TypeError,
    );
    expect(() => isDueWithin(record(), Number.POSITIVE_INFINITY, "2024-04-01")).toThrow(
      TypeError,
    );
  });

  test("throws TypeError for an invalid today", () => {
    expect(() => isDueWithin(record(), 7, "2024-02-30")).toThrow(TypeError);
  });
});

describe("record handling", () => {
  test("helpers never mutate the record", () => {
    const todo = record({ priority: "A", data: { due: "2024-04-01" } });
    const snapshot = JSON.parse(JSON.stringify(todo)) as TodoRecord;

    dueDate(todo);
    effectivePriority(todo);
    isOverdue(todo, "2024-04-02");
    isDueToday(todo, "2024-04-01");
    isDueWithin(todo, 7, "2024-04-01");

    expect(todo).toEqual(snapshot);
  });

  test("accept records with typed metadata", () => {
    const typed: TodoRecord<Record<string, string> & { due: string }> = {
      ...record(),
      data: { due: "2024-04-01" },
    };
    expect(dueDate(typed)).toBe("2024-04-01");
  });
});
