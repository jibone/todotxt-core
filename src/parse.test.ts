import { describe, expect, test } from "bun:test";
import { parseDocument, parseDocumentResult, parseLine } from "./parse.ts";
import type { ParseWarning } from "./types.ts";

describe("parseLine", () => {
  describe("priorities", () => {
    test("parses an uppercase priority that appears first", () => {
      expect(parseLine("(A) Call Mom")).toEqual({
        completed: false,
        priority: "A",
        completedAt: null,
        createdAt: null,
        description: "Call Mom",
        projects: [],
        contexts: [],
        data: {},
      });
    });

    test("does not parse a lowercase priority", () => {
      const item = parseLine("(b) Get back to the boss");

      expect(item.priority).toBeNull();
      expect(item.description).toBe("(b) Get back to the boss");
    });

    test("requires a space after the priority", () => {
      const item = parseLine("(B)->Submit TPS report");

      expect(item.priority).toBeNull();
      expect(item.description).toBe("(B)->Submit TPS report");
    });

    test("only recognizes a priority at the start of the line", () => {
      const item = parseLine("Really gotta call Mom (A) @phone @someday");

      expect(item.priority).toBeNull();
      expect(item.description).toBe("Really gotta call Mom (A)");
      expect(item.contexts).toEqual(["phone", "someday"]);
    });

    test("strips a leading byte-order mark before the priority", () => {
      const item = parseLine("\uFEFF(A) Call Mom");

      expect(item.priority).toBe("A");
      expect(item.description).toBe("Call Mom");
    });

    test("does not parse a priority on a completed task", () => {
      const item = parseLine("x (A) 2011-03-03 Call Mom");

      expect(item.completed).toBe(true);
      expect(item.priority).toBeNull();
    });
  });

  describe("creation dates", () => {
    test("parses a creation date without a priority", () => {
      const item = parseLine("2011-03-02 Document +TodoTxt task format");

      expect(item.priority).toBeNull();
      expect(item.createdAt).toBe("2011-03-02");
      expect(item.completedAt).toBeNull();
      expect(item.description).toBe("Document task format");
      expect(item.projects).toEqual(["TodoTxt"]);
    });

    test("parses a creation date after a priority", () => {
      const item = parseLine("(A) 2011-03-02 Call Mom");

      expect(item.priority).toBe("A");
      expect(item.createdAt).toBe("2011-03-02");
      expect(item.description).toBe("Call Mom");
    });

    test("does not parse a date that is not at the front", () => {
      const item = parseLine("(A) Call Mom 2011-03-02");

      expect(item.createdAt).toBeNull();
      expect(item.description).toBe("Call Mom 2011-03-02");
    });

    test("requires the YYYY-MM-DD shape", () => {
      const item = parseLine("2011-3-2 Document the format");

      expect(item.createdAt).toBeNull();
      expect(item.description).toBe("2011-3-2 Document the format");
    });

    test("accepts a date-only line", () => {
      const item = parseLine("(A) 2011-03-02");

      expect(item.priority).toBe("A");
      expect(item.createdAt).toBe("2011-03-02");
      expect(item.description).toBe("");
    });
  });

  describe("completed tasks", () => {
    test("parses a completed task and its completion date", () => {
      expect(parseLine("x 2011-03-03 Call Mom")).toEqual({
        completed: true,
        priority: null,
        completedAt: "2011-03-03",
        createdAt: null,
        description: "Call Mom",
        projects: [],
        contexts: [],
        data: {},
      });
    });

    test("parses completion and creation dates", () => {
      const item = parseLine(
        "x 2011-03-02 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
      );

      expect(item.completed).toBe(true);
      expect(item.completedAt).toBe("2011-03-02");
      expect(item.createdAt).toBe("2011-03-01");
      expect(item.description).toBe("Review Tim's pull request");
      expect(item.projects).toEqual(["TodoTxtTouch"]);
      expect(item.contexts).toEqual(["github"]);
    });

    test("accepts a completed task without dates", () => {
      const item = parseLine("x Call Mom");

      expect(item.completed).toBe(true);
      expect(item.completedAt).toBeNull();
      expect(item.createdAt).toBeNull();
      expect(item.description).toBe("Call Mom");
    });

    test("does not treat words beginning with x as completed", () => {
      const item = parseLine("xylophone lesson");

      expect(item.completed).toBe(false);
      expect(item.description).toBe("xylophone lesson");
    });

    test("is case-sensitive about the x marker", () => {
      const item = parseLine("X 2012-01-01 Make resolutions");

      expect(item.completed).toBe(false);
      expect(item.description).toBe("X 2012-01-01 Make resolutions");
    });

    test("treats x after a priority as text", () => {
      const item = parseLine("(A) x Find ticket prices");

      expect(item.completed).toBe(false);
      expect(item.priority).toBe("A");
      expect(item.description).toBe("x Find ticket prices");
    });
  });

  describe("projects and contexts", () => {
    test("parses multiple projects and contexts", () => {
      const item = parseLine(
        "(A) Call Mom +Family +PeaceLoveAndHappiness @iphone @phone",
      );

      expect(item.description).toBe("Call Mom");
      expect(item.projects).toEqual(["Family", "PeaceLoveAndHappiness"]);
      expect(item.contexts).toEqual(["iphone", "phone"]);
    });

    test("parses a context at the start of the text", () => {
      const item = parseLine("@GroceryStore pies");

      expect(item.description).toBe("pies");
      expect(item.contexts).toEqual(["GroceryStore"]);
    });

    test("does not treat an email address as a context", () => {
      const item = parseLine("Email SoAndSo at soandso@example.com");

      expect(item.contexts).toEqual([]);
      expect(item.description).toBe("Email SoAndSo at soandso@example.com");
    });

    test("does not treat arithmetic as a project", () => {
      const item = parseLine("Learn how to add 2+2");

      expect(item.projects).toEqual([]);
      expect(item.description).toBe("Learn how to add 2+2");
    });

    test("ignores bare + and @ tokens", () => {
      const item = parseLine("Compare + and @ symbols");

      expect(item.projects).toEqual([]);
      expect(item.contexts).toEqual([]);
      expect(item.description).toBe("Compare + and @ symbols");
    });
  });

  describe("extensions", () => {
    test("parses key:value metadata", () => {
      const item = parseLine("Pay rent due:2010-01-02 rec:1w");

      expect(item.data).toEqual({
        due: "2010-01-02",
        rec: "1w",
      });
      expect(item.description).toBe("Pay rent");
    });

    test("uses the last value when a key is repeated", () => {
      const item = parseLine("Task due:2010-01-02 due:2010-02-02");

      expect(item.data).toEqual({ due: "2010-02-02" });
      expect(item.description).toBe("Task");
    });

    test("keeps later colons in the value", () => {
      const item = parseLine("Task foo:bar:baz");

      expect(item.data).toEqual({ foo: "bar:baz" });
      expect(item.description).toBe("Task");
    });

    test("does not parse dates as extensions", () => {
      const item = parseLine("2011-03-02 Document the format");

      expect(item.data).toEqual({});
      expect(item.createdAt).toBe("2011-03-02");
      expect(item.description).toBe("Document the format");
    });
  });

  describe("description and whitespace", () => {
    test("normalizes whitespace left behind by removed metadata", () => {
      const item = parseLine("(A)   Call   Mom   +Family");

      expect(item.priority).toBe("A");
      expect(item.description).toBe("Call Mom");
      expect(item.projects).toEqual(["Family"]);
    });

    test("does not parse a priority after leading whitespace", () => {
      const item = parseLine("  (A)   Call Mom   ");

      expect(item.priority).toBeNull();
      expect(item.description).toBe("(A) Call Mom");
    });

    test("parses a priority with empty text", () => {
      const item = parseLine("(A) ");

      expect(item.priority).toBe("A");
      expect(item.description).toBe("");
    });

    test("returns an empty record for an empty line", () => {
      expect(parseLine("")).toEqual({
        completed: false,
        priority: null,
        completedAt: null,
        createdAt: null,
        description: "",
        projects: [],
        contexts: [],
        data: {},
      });
    });

    test("allows an empty description when only metadata is present", () => {
      const item = parseLine("+Family @phone due:2011-03-05");

      expect(item.description).toBe("");
      expect(item.projects).toEqual(["Family"]);
      expect(item.contexts).toEqual(["phone"]);
      expect(item.data).toEqual({ due: "2011-03-05" });
    });
  });
});

describe("parseDocument", () => {
  test("parses every non-empty line into a record", () => {
    const items = parseDocument(
      [
        "(A) Thank Mom for the meatballs @phone",
        "(B) Schedule Goodwill pickup +GarageSale @phone",
        "Post signs around the neighborhood +GarageSale",
      ].join("\n"),
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.priority)).toEqual(["A", "B", null]);
    expect(items.map((item) => item.description)).toEqual([
      "Thank Mom for the meatballs",
      "Schedule Goodwill pickup",
      "Post signs around the neighborhood",
    ]);
  });

  test("skips blank and whitespace-only lines", () => {
    const items = parseDocument("\n  \n(A) Call Mom\n\t\n");

    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe("Call Mom");
  });

  test("handles CRLF line endings", () => {
    const items = parseDocument("(A) Call Mom\r\nx 2011-03-03 Done\r\n");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      priority: "A",
      description: "Call Mom",
    });
    expect(items[1]).toMatchObject({
      completed: true,
      completedAt: "2011-03-03",
      description: "Done",
    });
  });

  test("handles lone carriage returns as line endings", () => {
    const items = parseDocument("(A) Call Mom\rx 2011-03-03 Done\r");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      priority: "A",
      description: "Call Mom",
    });
    expect(items[1]).toMatchObject({
      completed: true,
      completedAt: "2011-03-03",
      description: "Done",
    });
  });

  test("returns an empty array for empty input", () => {
    expect(parseDocument("")).toEqual([]);
    expect(parseDocument("\n\r\n   \n")).toEqual([]);
  });
});

describe("parseDocumentResult", () => {
  test("returns the same records as parseDocument", () => {
    const contents = [
      "(A) Thank Mom for the meatballs @phone",
      "",
      "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch",
      "Task due:2010-01-02 due:2010-02-02",
    ].join("\n");

    const result = parseDocumentResult(contents, { includeSource: true });

    expect(result.records).toEqual(
      parseDocument(contents, { includeSource: true }),
    );
  });

  test("collects warnings in document order with physical line numbers", () => {
    const result = parseDocumentResult(
      ["(A) First", "", "Task due:a due:b", "2011-99-99 Bad date"].join("\n"),
    );

    expect(
      result.warnings.map((warning) => [warning.code, warning.line]),
    ).toEqual([
      ["duplicate-metadata-key", 3],
      ["invalid-date", 4],
    ]);
  });

  test("numbers warning lines correctly with blank lines and CRLF", () => {
    const result = parseDocumentResult("First\r\n\r\nTask due:a due:b\r\n");

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.line).toBe(3);
  });

  test("treats a trailing lone carriage return as ending the last line", () => {
    const result = parseDocumentResult("First\rSecond\r");

    expect(result.lineCount).toBe(2);
    expect(result.skippedLines).toBe(0);
  });

  test("keeps in-line order when one line produces several warnings", () => {
    const result = parseDocumentResult("x 2011-99-99 Task due:a due:b");

    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "invalid-date",
      "duplicate-metadata-key",
    ]);
    expect(result.warnings.every((warning) => warning.line === 1)).toBe(true);
  });

  test("still forwards warnings to options.onWarning", () => {
    const forwarded: ParseWarning[] = [];
    const result = parseDocumentResult("Task due:a due:b", {
      onWarning: (warning) => forwarded.push(warning),
    });

    expect(forwarded).toEqual(result.warnings);
    expect(forwarded[0]?.line).toBe(1);
  });

  test("carries no warnings for a clean document", () => {
    const result = parseDocumentResult(
      "(A) Call Mom +Family @phone due:2011-03-05",
    );

    expect(result.warnings).toEqual([]);
  });

  test("counts physical lines and skipped blank lines", () => {
    const result = parseDocumentResult("a\n\n  \nb\n");

    expect(result.lineCount).toBe(4);
    expect(result.skippedLines).toBe(2);
    expect(result.records).toHaveLength(2);
  });

  test("a trailing newline does not add a phantom line", () => {
    expect(parseDocumentResult("a\nb\n")).toMatchObject({
      lineCount: 2,
      skippedLines: 0,
    });
    expect(parseDocumentResult("a\nb").lineCount).toBe(2);
    expect(parseDocumentResult("a\n\n").lineCount).toBe(2);
  });

  test("counts a lone newline as one blank line", () => {
    expect(parseDocumentResult("\n")).toEqual({
      records: [],
      warnings: [],
      lineCount: 1,
      skippedLines: 1,
    });
  });

  test("returns zero counts for empty input", () => {
    expect(parseDocumentResult("")).toEqual({
      records: [],
      warnings: [],
      lineCount: 0,
      skippedLines: 0,
    });
  });

  test("passes includeSource through to records", () => {
    const result = parseDocumentResult("a\n\nb", { includeSource: true });

    expect(result.records.map((record) => record.line)).toEqual([1, 3]);
    expect(result.records.map((record) => record.raw)).toEqual(["a", "b"]);
  });

  test("works without options", () => {
    const result = parseDocumentResult("(A) Call Mom");

    expect(result.records).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.lineCount).toBe(1);
  });
});

describe("parse warnings", () => {
  test("parseLine reports duplicate metadata keys without a line number", () => {
    const warnings: ParseWarning[] = [];
    const item = parseLine("Task due:2010-01-02 due:2010-02-02", (warning) => {
      warnings.push(warning);
    });

    expect(item.data).toEqual({ due: "2010-02-02" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "duplicate-metadata-key",
      message: 'Duplicate metadata key "due"; the last value wins.',
      meta: {
        key: "due",
        previousValue: "2010-01-02",
        value: "2010-02-02",
      },
    });
    expect(warnings[0]?.line).toBeUndefined();
  });

  test("parseDocument reports 1-based physical line numbers", () => {
    const warnings: ParseWarning[] = [];
    parseDocument(
      ["(A) First", "", "Task due:a due:b", "Task rec:1w rec:2w"].join("\n"),
      (warning) => {
        warnings.push(warning);
      },
    );

    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.line).toBe(3);
    expect(warnings[1]?.line).toBe(4);
  });

  test("does not warn about unique metadata keys", () => {
    const warnings: ParseWarning[] = [];
    parseDocument("Task due:2010-01-02 rec:1w", (warning) => {
      warnings.push(warning);
    });

    expect(warnings).toEqual([]);
  });

  test("does not require a warning handler", () => {
    expect(parseLine("Task due:a due:b").data).toEqual({ due: "b" });
    expect(parseDocument("Task due:a due:b")).toHaveLength(1);
  });

  test("accepts onWarning through the options object", () => {
    const warnings: ParseWarning[] = [];
    const item = parseLine("Task due:2010-01-02 due:2010-02-02", {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(item.data).toEqual({ due: "2010-02-02" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBeUndefined();
  });

  test("combines includeSource with onWarning", () => {
    const warnings: ParseWarning[] = [];
    const items = parseDocument("Task due:a due:b\n\n(A) Second", {
      includeSource: true,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(items.map((item) => item.line)).toEqual([1, 3]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(1);
  });
});

describe("source metadata", () => {
  test("omits line and raw by default", () => {
    const item = parseLine("(A) Call Mom");

    expect(item).not.toHaveProperty("line");
    expect(item).not.toHaveProperty("raw");
  });

  test("parseLine includes the exact raw line", () => {
    const item = parseLine("(A)   Call Mom   +Family", {
      includeSource: true,
    });

    expect(item.raw).toBe("(A)   Call Mom   +Family");
    expect(item).not.toHaveProperty("line");
  });

  test("parseLine attaches a caller-supplied line number", () => {
    const item = parseLine("(A) Call Mom", { includeSource: true, line: 7 });

    expect(item.line).toBe(7);
    expect(item.raw).toBe("(A) Call Mom");
  });

  test("parseLine ignores a line number without includeSource", () => {
    const item = parseLine("(A) Call Mom", { line: 7 });

    expect(item).not.toHaveProperty("line");
    expect(item).not.toHaveProperty("raw");
  });

  test("parseLine strips a trailing carriage return from raw", () => {
    const item = parseLine("(A) Call Mom\r", { includeSource: true });

    expect(item.raw).toBe("(A) Call Mom");
  });

  test("parseDocument numbers records by physical line", () => {
    const items = parseDocument("a\n\nb", { includeSource: true });

    expect(items.map((item) => item.line)).toEqual([1, 3]);
    expect(items.map((item) => item.raw)).toEqual(["a", "b"]);
  });

  test("parseDocument keeps raw exact while normalizing the description", () => {
    const items = parseDocument("  (A) Call   Mom  ", { includeSource: true });

    expect(items[0]?.raw).toBe("  (A) Call   Mom  ");
    expect(items[0]?.description).toBe("(A) Call Mom");
  });

  test("parseDocument raw has no trailing carriage return for CRLF input", () => {
    const items = parseDocument("(A) Call Mom\r\nx 2011-03-03 Done\r\n", {
      includeSource: true,
    });

    expect(items.map((item) => item.raw)).toEqual([
      "(A) Call Mom",
      "x 2011-03-03 Done",
    ]);
  });

  test("parseDocument omits source fields by default", () => {
    const items = parseDocument("(A) Call Mom");

    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("line");
    expect(items[0]).not.toHaveProperty("raw");
  });
});
