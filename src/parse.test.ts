import { describe, expect, test } from "bun:test";
import { parseDocument, parseLine } from "./parse.ts";

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

    test("does not parse a value containing another colon", () => {
      const item = parseLine("Task foo:bar:baz");

      expect(item.data).toEqual({});
      expect(item.description).toBe("Task foo:bar:baz");
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

  test("returns an empty array for empty input", () => {
    expect(parseDocument("")).toEqual([]);
    expect(parseDocument("\n\r\n   \n")).toEqual([]);
  });
});
