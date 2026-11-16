import { describe, expect, test } from "bun:test";
import { parseDocument, parseLine } from "./parse.ts";
import type { ParseWarning, TodoRecord } from "./types.ts";

/**
 * Specification tests for the todo.txt format rules.
 *
 * These tests intentionally assert the complete {@link TodoRecord} for
 * canonical examples, so a parser refactor cannot silently change the shape or
 * meaning of the rules. See `docs/todo-txt-rules.md`.
 */

function record(overrides: Partial<TodoRecord> = {}): TodoRecord {
  return {
    completed: false,
    priority: null,
    completedAt: null,
    createdAt: null,
    description: "",
    projects: [],
    contexts: [],
    data: {},
    ...overrides,
  };
}

function collectWarnings(): {
  warnings: ParseWarning[];
  onWarning: (warning: ParseWarning) => void;
} {
  const warnings: ParseWarning[] = [];
  return {
    warnings,
    onWarning: (warning) => warnings.push(warning),
  };
}

describe("Rule 1: priority appears first", () => {
  test("parses a priority at the start of the line", () => {
    expect(parseLine("(A) Call Mom")).toEqual(
      record({ priority: "A", description: "Call Mom" }),
    );
  });

  test("does not parse a parenthesized letter that is not first", () => {
    expect(parseLine("Really gotta call Mom (A) @phone @someday")).toEqual(
      record({
        description: "Really gotta call Mom (A)",
        contexts: ["phone", "someday"],
      }),
    );
  });

  test("rejects lowercase priorities", () => {
    expect(parseLine("(b) Get back to the boss")).toEqual(
      record({ description: "(b) Get back to the boss" }),
    );
  });

  test("requires a space after the priority", () => {
    expect(parseLine("(B)->Submit TPS report")).toEqual(
      record({ description: "(B)->Submit TPS report" }),
    );
    expect(parseLine("(A)Call Mom")).toEqual(
      record({ description: "(A)Call Mom" }),
    );
  });

  test("requires a literal space, not any whitespace", () => {
    expect(parseLine("(A)\tCall Mom")).toEqual(
      record({ description: "(A) Call Mom" }),
    );
  });

  test("does not parse a priority after leading whitespace", () => {
    expect(parseLine(" (A) Call Mom")).toEqual(
      record({ description: "(A) Call Mom" }),
    );
  });

  test("parses only the first priority", () => {
    expect(parseLine("(A) (B) Call Mom")).toEqual(
      record({ priority: "A", description: "(B) Call Mom" }),
    );
  });

  test("accepts a priority with no description", () => {
    expect(parseLine("(A) ")).toEqual(record({ priority: "A" }));
  });
});

describe("Rule 2: creation date directly after priority", () => {
  test("parses a creation date without a priority", () => {
    expect(parseLine("2011-03-02 Document +TodoTxt task format")).toEqual(
      record({
        createdAt: "2011-03-02",
        description: "Document task format",
        projects: ["TodoTxt"],
      }),
    );
  });

  test("parses a creation date after a priority", () => {
    expect(parseLine("(A) 2011-03-02 Call Mom")).toEqual(
      record({
        priority: "A",
        createdAt: "2011-03-02",
        description: "Call Mom",
      }),
    );
  });

  test("does not parse a creation date that is not at the front", () => {
    expect(parseLine("(A) Call Mom 2011-03-02")).toEqual(
      record({
        priority: "A",
        description: "Call Mom 2011-03-02",
      }),
    );
  });

  test("requires the YYYY-MM-DD shape", () => {
    expect(parseLine("2011-3-2 Document the format")).toEqual(
      record({ description: "2011-3-2 Document the format" }),
    );
  });

  test("accepts a date-only line", () => {
    expect(parseLine("(A) 2011-03-02")).toEqual(
      record({ priority: "A", createdAt: "2011-03-02" }),
    );
  });

  test("parses leap days that exist", () => {
    expect(parseLine("2012-02-29 Leap day")).toEqual(
      record({ createdAt: "2012-02-29", description: "Leap day" }),
    );
    expect(parseLine("2000-02-29 Leap day")).toEqual(
      record({ createdAt: "2000-02-29", description: "Leap day" }),
    );
  });

  test("rejects impossible months and days", () => {
    for (const date of [
      "2011-99-99",
      "2011-13-01",
      "2011-00-10",
      "2011-02-30",
      "2011-04-31",
    ]) {
      expect(parseLine(`${date} Broken date`)).toEqual(
        record({ description: `${date} Broken date` }),
      );
    }
  });

  test("rejects February 29 in non-leap years", () => {
    expect(parseLine("2011-02-29 Leap check")).toEqual(
      record({ description: "2011-02-29 Leap check" }),
    );
    expect(parseLine("1900-02-29 Leap check")).toEqual(
      record({ description: "1900-02-29 Leap check" }),
    );
  });

  test("warns about an invalid creation date and keeps it in the text", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("2011-99-99 Broken date", onWarning);

    expect(item).toEqual(record({ description: "2011-99-99 Broken date" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "invalid-date",
      message: 'Invalid creation date "2011-99-99"; treating it as text.',
      meta: { value: "2011-99-99", field: "createdAt" },
    });
    expect(warnings[0]?.line).toBeUndefined();
  });

  test("warns about an invalid creation date after a priority", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("(A) 2011-99-99 Call Mom", onWarning);

    expect(item).toEqual(
      record({
        priority: "A",
        description: "2011-99-99 Call Mom",
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta.field).toBe("createdAt");
  });

  test("does not consider a later date when the leading one is invalid", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("2011-99-99 2011-03-01 Task", onWarning);

    expect(item).toEqual(
      record({ description: "2011-99-99 2011-03-01 Task" }),
    );
    expect(warnings).toHaveLength(1);
  });

  test("reports invalid-date warnings with a 1-based line number", () => {
    const { warnings, onWarning } = collectWarnings();
    parseDocument("(A) First\n\n2011-99-99 Broken", onWarning);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(3);
  });
});

describe("Rule 3: projects and contexts appear anywhere after the prefix", () => {
  test("parses multiple projects and contexts", () => {
    expect(
      parseLine("(A) Call Mom +Family +PeaceLoveAndHappiness @iphone @phone"),
    ).toEqual(
      record({
        priority: "A",
        description: "Call Mom",
        projects: ["Family", "PeaceLoveAndHappiness"],
        contexts: ["iphone", "phone"],
      }),
    );
  });

  test("parses projects and contexts of various shapes", () => {
    expect(parseLine("Call +driftradio @phone")).toMatchObject({
      projects: ["driftradio"],
      contexts: ["phone"],
    });
    expect(parseLine("Call +driftradio.net @email-work")).toMatchObject({
      projects: ["driftradio.net"],
      contexts: ["email-work"],
    });
    expect(parseLine("Call +drift-radio")).toMatchObject({
      projects: ["drift-radio"],
    });
  });

  test("stops a project or context at whitespace", () => {
    expect(parseLine("Call +drift radio")).toEqual(
      record({
        description: "Call radio",
        projects: ["drift"],
      }),
    );
    expect(parseLine("Call @email work")).toEqual(
      record({
        description: "Call work",
        contexts: ["email"],
      }),
    );
  });

  test("parses a context at the start of the text", () => {
    expect(parseLine("@GroceryStore pies")).toEqual(
      record({ description: "pies", contexts: ["GroceryStore"] }),
    );
  });

  test("does not treat a tag before the priority position as a priority", () => {
    expect(parseLine("@phone (A) Call Mom")).toEqual(
      record({
        description: "(A) Call Mom",
        contexts: ["phone"],
      }),
    );
  });

  test("does not treat an email address as a context", () => {
    expect(parseLine("Email SoAndSo at soandso@example.com")).toEqual(
      record({ description: "Email SoAndSo at soandso@example.com" }),
    );
  });

  test("does not treat arithmetic as a project", () => {
    expect(parseLine("Learn how to add 2+2")).toEqual(
      record({ description: "Learn how to add 2+2" }),
    );
  });

  test("ignores bare + and @ tokens", () => {
    expect(parseLine("Compare + and @ symbols")).toEqual(
      record({ description: "Compare + and @ symbols" }),
    );
  });

  test("keeps trailing punctuation as part of the name", () => {
    expect(parseLine("Call Mom +Family, @phone.")).toEqual(
      record({
        description: "Call Mom",
        projects: ["Family,"],
        contexts: ["phone."],
      }),
    );
  });

  test("keeps duplicate names in their original order", () => {
    expect(parseLine("Call Mom +Family +Family @phone @phone")).toEqual(
      record({
        description: "Call Mom",
        projects: ["Family", "Family"],
        contexts: ["phone", "phone"],
      }),
    );
  });

  test("treats + and @ tokens as tags even when they contain a colon", () => {
    expect(parseLine("Call Mom @foo:bar +baz:qux")).toEqual(
      record({
        description: "Call Mom",
        projects: ["baz:qux"],
        contexts: ["foo:bar"],
      }),
    );
  });
});

describe("Rule 4: completed tasks start with lowercase x and a space", () => {
  test("parses a completed task and its completion date", () => {
    expect(parseLine("x 2011-03-03 Call Mom")).toEqual(
      record({
        completed: true,
        completedAt: "2011-03-03",
        description: "Call Mom",
      }),
    );
  });

  test("parses completion and creation dates", () => {
    expect(
      parseLine(
        "x 2011-03-02 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
      ),
    ).toEqual(
      record({
        completed: true,
        completedAt: "2011-03-02",
        createdAt: "2011-03-01",
        description: "Review Tim's pull request",
        projects: ["TodoTxtTouch"],
        contexts: ["github"],
      }),
    );
  });

  test("preserves priority through the pri: metadata key", () => {
    expect(parseLine("x 2011-03-02 2011-03-01 Task pri:A")).toEqual(
      record({
        completed: true,
        completedAt: "2011-03-02",
        createdAt: "2011-03-01",
        description: "Task",
        data: { pri: "A" },
      }),
    );
  });

  test("does not treat words beginning with x as completed", () => {
    expect(parseLine("xylophone lesson")).toEqual(
      record({ description: "xylophone lesson" }),
    );
    expect(parseLine("x2011-03-03 Call Mom")).toEqual(
      record({ description: "x2011-03-03 Call Mom" }),
    );
    expect(parseLine("x")).toEqual(record({ description: "x" }));
  });

  test("is case-sensitive and requires a literal space", () => {
    expect(parseLine("X 2012-01-01 Make resolutions")).toEqual(
      record({ description: "X 2012-01-01 Make resolutions" }),
    );
    expect(parseLine("x\tCall Mom")).toEqual(
      record({ description: "x Call Mom" }),
    );
    expect(parseLine("  x Call Mom")).toEqual(
      record({ description: "x Call Mom" }),
    );
  });

  test("treats x after a priority as text", () => {
    expect(parseLine("(A) x Find ticket prices")).toEqual(
      record({ priority: "A", description: "x Find ticket prices" }),
    );
  });

  test("does not parse a priority on a completed task", () => {
    expect(parseLine("x (A) 2011-03-03 Call Mom")).toEqual(
      record({
        completed: true,
        description: "(A) 2011-03-03 Call Mom",
      }),
    );
  });

  test("accepts a completed task without a completion date", () => {
    expect(parseLine("x Call Mom")).toEqual(
      record({ completed: true, description: "Call Mom" }),
    );
  });

  test("treats the first date as the completion date", () => {
    expect(parseLine("x 2011-03-01 Task")).toEqual(
      record({
        completed: true,
        completedAt: "2011-03-01",
        description: "Task",
      }),
    );
  });

  test("accepts a completed date-only line", () => {
    expect(parseLine("x 2011-03-02")).toEqual(
      record({ completed: true, completedAt: "2011-03-02" }),
    );
  });

  test("warns about an invalid completion date", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("x 2011-99-99 Call Mom", onWarning);

    expect(item).toEqual(
      record({ completed: true, description: "2011-99-99 Call Mom" }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "invalid-date",
      message: 'Invalid completion date "2011-99-99"; treating it as text.',
      meta: { value: "2011-99-99", field: "completedAt" },
    });
  });

  test("warns once when a completed line has an invalid leading date", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("x 2011-99-99 2011-03-01 Task", onWarning);

    expect(item).toEqual(
      record({
        completed: true,
        description: "2011-99-99 2011-03-01 Task",
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta.field).toBe("completedAt");
  });

  test("warns about an invalid creation date on a completed task", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("x 2011-03-02 2011-99-99 Task", onWarning);

    expect(item).toEqual(
      record({
        completed: true,
        completedAt: "2011-03-02",
        description: "2011-99-99 Task",
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta.field).toBe("createdAt");
  });
});

describe("Rule 5: extra metadata is key:value", () => {
  test("parses key:value metadata", () => {
    expect(parseLine("Pay rent due:2010-01-02 rec:1w")).toEqual(
      record({
        description: "Pay rent",
        data: { due: "2010-01-02", rec: "1w" },
      }),
    );
  });

  test("requires a non-empty key and value", () => {
    expect(parseLine("Call Mom due:")).toEqual(
      record({ description: "Call Mom due:" }),
    );
    expect(parseLine("Call Mom :value")).toEqual(
      record({ description: "Call Mom :value" }),
    );
    expect(parseLine("Call Mom key: value")).toEqual(
      record({ description: "Call Mom key: value" }),
    );
  });

  test("rejects values that contain another colon", () => {
    expect(parseLine("Call Mom a:b:c")).toEqual(
      record({ description: "Call Mom a:b:c" }),
    );
    expect(parseLine("Call Mom TODO:2011-03-02T10:00")).toEqual(
      record({ description: "Call Mom TODO:2011-03-02T10:00" }),
    );
  });

  test("parses tokens with exactly one colon, even when they look like URLs", () => {
    expect(parseLine("Call Mom http://example.com")).toEqual(
      record({
        description: "Call Mom",
        data: { http: "//example.com" },
      }),
    );
  });

  test("keeps the last value and warns when a key is repeated", () => {
    const { warnings, onWarning } = collectWarnings();
    const item = parseLine("Task due:2010-01-02 due:2010-02-02", onWarning);

    expect(item).toEqual(
      record({ description: "Task", data: { due: "2010-02-02" } }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "duplicate-metadata-key",
      meta: {
        key: "due",
        previousValue: "2010-01-02",
        value: "2010-02-02",
      },
    });
  });

  test("does not validate date-like metadata values", () => {
    expect(parseLine("Task due:2011-99-99")).toEqual(
      record({ description: "Task", data: { due: "2011-99-99" } }),
    );
  });

  test("allows a record made only of metadata", () => {
    expect(parseLine("+Family @phone due:2011-03-05")).toEqual(
      record({
        projects: ["Family"],
        contexts: ["phone"],
        data: { due: "2011-03-05" },
      }),
    );
  });
});

describe("Documented strictness and leniency", () => {
  test("dates and tags are only parsed after the line prefix", () => {
    expect(parseLine("Call Mom 2011-03-02")).toEqual(
      record({ description: "Call Mom 2011-03-02" }),
    );
  });

  test("whitespace left behind by metadata is normalized", () => {
    expect(parseLine("(A)   Call   Mom   +Family")).toEqual(
      record({ priority: "A", description: "Call Mom", projects: ["Family"] }),
    );
  });

  test("blank and whitespace-only lines are skipped", () => {
    expect(parseDocument("\n  \n(A) Call Mom\n\t\n")).toEqual([
      record({ priority: "A", description: "Call Mom" }),
    ]);
  });

  test("CRLF line endings are handled", () => {
    expect(parseDocument("(A) Call Mom\r\nx 2011-03-03 Done\r\n")).toEqual([
      record({ priority: "A", description: "Call Mom" }),
      record({ completed: true, completedAt: "2011-03-03", description: "Done" }),
    ]);
  });
});
