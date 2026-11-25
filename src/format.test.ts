import { describe, expect, test } from "bun:test";
import { formatDocument, formatRecord } from "./format.ts";
import { parseDocument, parseLine } from "./parse.ts";
import type { TodoRecord } from "./types.ts";

const emptyRecord: TodoRecord = {
  completed: false,
  priority: null,
  completedAt: null,
  createdAt: null,
  description: "",
  projects: [],
  contexts: [],
  data: {},
};

describe("formatRecord", () => {
  test("emits the canonical order for a fully-populated record", () => {
    const record = parseLine(
      "(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05",
    );

    expect(formatRecord(record)).toBe(
      "(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05",
    );
  });

  test("emits the canonical order for a completed record", () => {
    const record = parseLine("x 2011-03-03 2011-03-01 Done +Chores @home");

    expect(formatRecord(record)).toBe(
      "x 2011-03-03 2011-03-01 Done +Chores @home",
    );
  });

  test("alphabetizes projects, contexts, and metadata keys", () => {
    const record = parseLine("Sort +b +a @z @y z:1 a:2");

    expect(formatRecord(record)).toBe("Sort +a +b @y @z a:2 z:1");
  });

  test("moves tags after the description instead of their source positions", () => {
    const record = parseLine("Call +Mom about the @phone report");

    expect(formatRecord(record)).toBe("Call about the report +Mom @phone");
  });

  test("formats a plain task without decoration", () => {
    expect(formatRecord(parseLine("Buy milk"))).toBe("Buy milk");
  });

  test("formats a completed record without dates", () => {
    expect(formatRecord(parseLine("x Done"))).toBe("x Done");
  });

  test("keeps an empty metadata value", () => {
    expect(formatRecord(parseLine("Empty key:"))).toBe("Empty key:");
  });

  test("formats an all-empty record as an empty string", () => {
    expect(formatRecord(emptyRecord)).toBe("");
  });

  test("emits priority after the completion date on hand-built records", () => {
    // The parser never keeps a priority on a completed line, so this shape
    // can only come from a hand-built or mutated record.
    const done: TodoRecord = {
      ...emptyRecord,
      completed: true,
      priority: "A",
      completedAt: "2026-01-01",
      createdAt: "2026-01-02",
      description: "Task",
    };

    expect(formatRecord(done)).toBe("x 2026-01-01 (A) 2026-01-02 Task");
  });

  test("omits tag groups via the include options", () => {
    const record = parseLine(
      "(A) Call Mom +Family @phone due:2011-03-05 rec:1w",
    );

    expect(formatRecord(record, { includeProjects: false })).toBe(
      "(A) Call Mom @phone due:2011-03-05 rec:1w",
    );
    expect(formatRecord(record, { includeContexts: false })).toBe(
      "(A) Call Mom +Family due:2011-03-05 rec:1w",
    );
    expect(formatRecord(record, { includeMetadata: false })).toBe(
      "(A) Call Mom +Family @phone",
    );
    expect(
      formatRecord(record, {
        includeProjects: false,
        includeContexts: false,
        includeMetadata: false,
      }),
    ).toBe("(A) Call Mom");
  });

  test("ignores raw and always formats from the record fields", () => {
    // Duplicate keys collapse to the last value, so the canonical output
    // differs from the raw line.
    const record = parseLine("Task due:1 due:2", { includeSource: true });

    expect(record.raw).toBe("Task due:1 due:2");
    expect(record.data).toEqual({ due: "2" });
    expect(formatRecord(record)).toBe("Task due:2");
  });
});

describe("formatDocument", () => {
  test("joins records with the default EOL and a trailing newline", () => {
    const records = parseDocument("(A) First +p\nx 2011-03-03 Second");

    expect(formatDocument(records)).toBe(
      "(A) First +p\nx 2011-03-03 Second\n",
    );
  });

  test("joins records with CRLF when requested", () => {
    const records = parseDocument("(A) First +p\nx 2011-03-03 Second");

    expect(formatDocument(records, { eol: "\r\n" })).toBe(
      "(A) First +p\r\nx 2011-03-03 Second\r\n",
    );
  });

  test("joins records with a lone CR when requested", () => {
    const records = parseDocument("(A) First +p\nx 2011-03-03 Second");

    expect(formatDocument(records, { eol: "\r" })).toBe(
      "(A) First +p\rx 2011-03-03 Second\r",
    );
  });

  test("formats an empty record list as an empty string", () => {
    expect(formatDocument([])).toBe("");
  });

  test("passes the include options through to every record", () => {
    const records = parseDocument(
      "First due:2011-03-05\nSecond rec:1w",
    );

    expect(formatDocument(records, { includeMetadata: false })).toBe(
      "First\nSecond\n",
    );
  });

  test("formats an all-empty record as a blank line", () => {
    expect(formatDocument([emptyRecord])).toBe("\n");
  });

  test("round-trips through parseDocument for canonical records", () => {
    const source = [
      "(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05",
      "2011-03-02 Document the format",
      "x 2011-03-03 2011-03-01 Done +Chores @home",
      "Plain task",
    ].join("\n");

    const records = parseDocument(source);

    expect(parseDocument(formatDocument(records))).toEqual(records);
  });

  test("stays canonical through a reparse even with unordered source tags", () => {
    const records = parseDocument(
      [
        "x 2011-03-05 Replace furnace filter @phone @archive",
        "(B) Weed +Garden @home @hardware due:2024-06-01",
      ].join("\n"),
    );

    const formatted = formatDocument(records);
    const reparsed = parseDocument(formatted);

    // Formatting is idempotent: a reparse of canonical output formats back
    // to the same document, even though the source tag order was lost.
    expect(formatDocument(reparsed)).toBe(formatted);
    expect(reparsed[0]?.contexts).toEqual(["archive", "phone"]);
    expect(reparsed[1]?.contexts).toEqual(["hardware", "home"]);
  });
});
