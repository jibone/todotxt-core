import { describe, expect, test } from "bun:test";
import { parseDocument, parseLine } from "./parse.ts";

describe("parseLine", () => {
  describe("priorities", () => {
    test("parses an uppercase priority that appears first", () => {
      expect(parseLine("(A) Call Mom")).toEqual({
        raw: "(A) Call Mom",
        completed: false,
        priority: "A",
        completionDate: null,
        creationDate: null,
        text: "Call Mom",
        projects: [],
        contexts: [],
        extensions: {},
      });
    });

    test("does not parse a lowercase priority", () => {
      const item = parseLine("(b) Get back to the boss");

      expect(item.priority).toBeNull();
      expect(item.text).toBe("(b) Get back to the boss");
    });

    test("requires a space after the priority", () => {
      const item = parseLine("(B)->Submit TPS report");

      expect(item.priority).toBeNull();
      expect(item.text).toBe("(B)->Submit TPS report");
    });

    test("only recognizes a priority at the start of the line", () => {
      const item = parseLine("Really gotta call Mom (A) @phone @someday");

      expect(item.priority).toBeNull();
      expect(item.text).toBe("Really gotta call Mom (A) @phone @someday");
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
      expect(item.creationDate).toBe("2011-03-02");
      expect(item.completionDate).toBeNull();
      expect(item.text).toBe("Document +TodoTxt task format");
      expect(item.projects).toEqual(["TodoTxt"]);
    });

    test("parses a creation date after a priority", () => {
      const item = parseLine("(A) 2011-03-02 Call Mom");

      expect(item.priority).toBe("A");
      expect(item.creationDate).toBe("2011-03-02");
      expect(item.text).toBe("Call Mom");
    });

    test("does not parse a date that is not at the front", () => {
      const item = parseLine("(A) Call Mom 2011-03-02");

      expect(item.creationDate).toBeNull();
      expect(item.text).toBe("Call Mom 2011-03-02");
    });

    test("requires the YYYY-MM-DD shape", () => {
      const item = parseLine("2011-3-2 Document the format");

      expect(item.creationDate).toBeNull();
      expect(item.text).toBe("2011-3-2 Document the format");
    });

    test("accepts a date-only line", () => {
      const item = parseLine("(A) 2011-03-02");

      expect(item.priority).toBe("A");
      expect(item.creationDate).toBe("2011-03-02");
      expect(item.text).toBe("");
    });
  });

  describe("completed tasks", () => {
    test("parses a completed task and its completion date", () => {
      expect(parseLine("x 2011-03-03 Call Mom")).toEqual({
        raw: "x 2011-03-03 Call Mom",
        completed: true,
        priority: null,
        completionDate: "2011-03-03",
        creationDate: null,
        text: "Call Mom",
        projects: [],
        contexts: [],
        extensions: {},
      });
    });

    test("parses completion and creation dates", () => {
      const item = parseLine(
        "x 2011-03-02 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
      );

      expect(item.completed).toBe(true);
      expect(item.completionDate).toBe("2011-03-02");
      expect(item.creationDate).toBe("2011-03-01");
      expect(item.text).toBe("Review Tim's pull request +TodoTxtTouch @github");
      expect(item.projects).toEqual(["TodoTxtTouch"]);
      expect(item.contexts).toEqual(["github"]);
    });

    test("accepts a completed task without dates", () => {
      const item = parseLine("x Call Mom");

      expect(item.completed).toBe(true);
      expect(item.completionDate).toBeNull();
      expect(item.creationDate).toBeNull();
      expect(item.text).toBe("Call Mom");
    });

    test("does not treat words beginning with x as completed", () => {
      const item = parseLine("xylophone lesson");

      expect(item.completed).toBe(false);
      expect(item.text).toBe("xylophone lesson");
    });

    test("is case-sensitive about the x marker", () => {
      const item = parseLine("X 2012-01-01 Make resolutions");

      expect(item.completed).toBe(false);
      expect(item.text).toBe("X 2012-01-01 Make resolutions");
    });

    test("treats x after a priority as text", () => {
      const item = parseLine("(A) x Find ticket prices");

      expect(item.completed).toBe(false);
      expect(item.priority).toBe("A");
      expect(item.text).toBe("x Find ticket prices");
    });
  });

  describe("projects and contexts", () => {
    test("parses multiple projects and contexts", () => {
      const item = parseLine(
        "(A) Call Mom +Family +PeaceLoveAndHappiness @iphone @phone",
      );

      expect(item.projects).toEqual(["Family", "PeaceLoveAndHappiness"]);
      expect(item.contexts).toEqual(["iphone", "phone"]);
    });

    test("parses a context at the start of the text", () => {
      const item = parseLine("@GroceryStore pies");

      expect(item.contexts).toEqual(["GroceryStore"]);
    });

    test("does not treat an email address as a context", () => {
      const item = parseLine("Email SoAndSo at soandso@example.com");

      expect(item.contexts).toEqual([]);
      expect(item.text).toBe("Email SoAndSo at soandso@example.com");
    });

    test("does not treat arithmetic as a project", () => {
      const item = parseLine("Learn how to add 2+2");

      expect(item.projects).toEqual([]);
      expect(item.text).toBe("Learn how to add 2+2");
    });

    test("ignores bare + and @ tokens", () => {
      const item = parseLine("Compare + and @ symbols");

      expect(item.projects).toEqual([]);
      expect(item.contexts).toEqual([]);
    });
  });

  describe("extensions", () => {
    test("parses key:value metadata", () => {
      const item = parseLine("Pay rent due:2010-01-02 rec:1w");

      expect(item.extensions).toEqual({
        due: "2010-01-02",
        rec: "1w",
      });
      expect(item.text).toBe("Pay rent due:2010-01-02 rec:1w");
    });

    test("uses the last value when a key is repeated", () => {
      const item = parseLine("Task due:2010-01-02 due:2010-02-02");

      expect(item.extensions).toEqual({ due: "2010-02-02" });
    });

    test("does not parse a value containing another colon", () => {
      const item = parseLine("Task foo:bar:baz");

      expect(item.extensions).toEqual({});
    });

    test("does not parse dates as extensions", () => {
      const item = parseLine("2011-03-02 Document the format");

      expect(item.extensions).toEqual({});
    });
  });

  describe("whitespace and raw content", () => {
    test("preserves the raw line and trims surrounding whitespace from text", () => {
      const item = parseLine("  (A)   Call Mom   ");

      expect(item.raw).toBe("  (A)   Call Mom   ");
      expect(item.priority).toBeNull();
      expect(item.text).toBe("(A)   Call Mom");
    });

    test("parses a priority with empty text", () => {
      const item = parseLine("(A) ");

      expect(item.priority).toBe("A");
      expect(item.text).toBe("");
    });

    test("returns an empty item for an empty line", () => {
      expect(parseLine("")).toEqual({
        raw: "",
        completed: false,
        priority: null,
        completionDate: null,
        creationDate: null,
        text: "",
        projects: [],
        contexts: [],
        extensions: {},
      });
    });
  });
});

describe("parseDocument", () => {
  test("parses every non-empty line", () => {
    const items = parseDocument(
      [
        "(A) Thank Mom for the meatballs @phone",
        "(B) Schedule Goodwill pickup +GarageSale @phone",
        "Post signs around the neighborhood +GarageSale",
      ].join("\n"),
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.priority)).toEqual(["A", "B", null]);
    expect(items.map((item) => item.text)).toEqual([
      "Thank Mom for the meatballs @phone",
      "Schedule Goodwill pickup +GarageSale @phone",
      "Post signs around the neighborhood +GarageSale",
    ]);
  });

  test("skips blank and whitespace-only lines", () => {
    const items = parseDocument("\n  \n(A) Call Mom\n\t\n");

    expect(items).toHaveLength(1);
    expect(items[0]?.text).toBe("Call Mom");
  });

  test("handles CRLF line endings", () => {
    const items = parseDocument("(A) Call Mom\r\nx 2011-03-03 Done\r\n");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      raw: "(A) Call Mom",
      priority: "A",
      text: "Call Mom",
    });
    expect(items[1]).toMatchObject({
      raw: "x 2011-03-03 Done",
      completed: true,
      completionDate: "2011-03-03",
      text: "Done",
    });
  });

  test("returns an empty array for empty input", () => {
    expect(parseDocument("")).toEqual([]);
    expect(parseDocument("\n\r\n   \n")).toEqual([]);
  });
});
