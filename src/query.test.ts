import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";

const CONTENTS = [
  "(A) Thank Mom for the meatballs @phone",
  "(B) Schedule Goodwill pickup +GarageSale @phone",
  "Post signs around the neighborhood +GarageSale @errands",
  "2011-03-02 Document +TodoTxt task format due:2011-03-05 @computer",
  "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
  "Learn how to add 2+2",
  "Email SoAndSo at soandso@example.com",
  "x 2011-03-04 Update README +TodoTxt @computer",
  "x 2011-03-05 Replace furnace filter @phone @archive",
  "(A) Buy paint +GarageSale @errands @hardware",
  "x 2011-03-06 2011-03-01 Order moving boxes +Moving @errands",
  "(C) Pack kitchen +Moving @home",
  "x 2011-03-07 Clean garage +GarageSale @home",
  "2024-01-10 Write parser tests +TodoTxt +OpenSource @computer",
  "x 2024-01-12 Publish v0.1 +TodoTxt +OpenSource @computer",
  "(B) Review PR +OpenSource @github",
  "x 2024-01-15 Merge PR +OpenSource @github @archive",
  "(A) Plant tomatoes +Garden @home",
  "(B) Weed the flower bed +Garden @home @hardware",
].join("\n");

function createClient(contents = CONTENTS): TodoTxtClient {
  return createTodoTxt({
    read: () => contents,
    write: () => {},
  });
}

function descriptions(records: { description: string }[]): string[] {
  return records.map((record) => record.description);
}

describe("all and record filters", () => {
  test("all() returns every parsed record", async () => {
    const todos = createClient();

    expect(await todos.all()).toHaveLength(19);
    expect((await todos.all())[0]?.description).toBe(
      "Thank Mom for the meatballs",
    );
  });

  test("pending() and completed() partition the records", async () => {
    const todos = createClient();

    expect(await todos.pending()).toHaveLength(12);
    expect(await todos.completed()).toHaveLength(7);
  });

  test("status filters compose sequentially", async () => {
    const todos = createClient();

    expect(await todos.pending().completed()).toEqual([]);
    expect(await todos.completed().pending()).toEqual([]);
  });
});

describe("project filters", () => {
  test("lists every record in a project in file order", async () => {
    const todos = createClient();

    expect(descriptions(await todos.project("TodoTxt"))).toEqual([
      "Document task format",
      "Update README",
      "Write parser tests",
      "Publish v0.1",
    ]);
  });

  test("lists only pending records in a project", async () => {
    const todos = createClient();

    expect(descriptions(await todos.project("TodoTxt").pending())).toEqual([
      "Document task format",
      "Write parser tests",
    ]);
  });

  test("lists only completed records in a project", async () => {
    const todos = createClient();

    expect(descriptions(await todos.project("TodoTxt").completed())).toEqual([
      "Update README",
      "Publish v0.1",
    ]);
  });

  test("returns an empty list for an unknown project", async () => {
    const todos = createClient();

    expect(await todos.project("Missing")).toEqual([]);
    expect(await todos.project("Missing").pending()).toEqual([]);
    expect(await todos.project("Missing").completed()).toEqual([]);
  });

  test("matches project names case-sensitively", async () => {
    const todos = createClient();

    expect(await todos.project("todotxt")).toEqual([]);
  });

  test("lists an item tagged with several projects under each", async () => {
    const todos = createClient("(A) Shared task +Alpha +Beta");

    expect((await todos.project("Alpha"))[0]?.description).toBe("Shared task");
    expect((await todos.project("Beta"))[0]?.description).toBe("Shared task");
  });

  test("does not duplicate an item tagged with the same project twice", async () => {
    const todos = createClient("(A) Shared task +Alpha +Alpha");

    expect(await todos.project("Alpha")).toHaveLength(1);
  });

  test("project filters intersect", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.project("TodoTxt").project("OpenSource")),
    ).toEqual(["Write parser tests", "Publish v0.1"]);
  });
});

describe("context filters", () => {
  test("lists every record in a context in file order", async () => {
    const todos = createClient();

    expect(descriptions(await todos.context("home"))).toEqual([
      "Pack kitchen",
      "Clean garage",
      "Plant tomatoes",
      "Weed the flower bed",
    ]);
  });

  test("lists only pending records in a context", async () => {
    const todos = createClient();

    expect(descriptions(await todos.context("home").pending())).toEqual([
      "Pack kitchen",
      "Plant tomatoes",
      "Weed the flower bed",
    ]);
  });

  test("lists only completed records in a context", async () => {
    const todos = createClient();

    expect(descriptions(await todos.context("home").completed())).toEqual([
      "Clean garage",
    ]);
  });

  test("returns an empty list for an unknown context", async () => {
    const todos = createClient();

    expect(await todos.context("Missing")).toEqual([]);
    expect(await todos.context("Missing").pending()).toEqual([]);
    expect(await todos.context("Missing").completed()).toEqual([]);
  });

  test("matches context names case-sensitively", async () => {
    const todos = createClient();

    expect(await todos.context("Computer")).toEqual([]);
  });

  test("lists an item tagged with several contexts under each", async () => {
    const todos = createClient("(A) Shared task @home @office");

    expect((await todos.context("home"))[0]?.description).toBe("Shared task");
    expect((await todos.context("office"))[0]?.description).toBe("Shared task");
  });

  test("does not duplicate an item tagged with the same context twice", async () => {
    const todos = createClient("(A) Shared task @home @home");

    expect(await todos.context("home")).toHaveLength(1);
  });
});

describe("name plucks", () => {
  test("lists every unique project alphabetically", async () => {
    const todos = createClient();

    expect(await todos.projects()).toEqual([
      "GarageSale",
      "Garden",
      "Moving",
      "OpenSource",
      "TodoTxt",
      "TodoTxtTouch",
    ]);
  });

  test("lists every unique context alphabetically", async () => {
    const todos = createClient();

    expect(await todos.contexts()).toEqual([
      "archive",
      "computer",
      "errands",
      "github",
      "hardware",
      "home",
      "phone",
    ]);
  });

  test("plucks projects from pending records", async () => {
    const todos = createClient();

    expect(await todos.pending().projects()).toEqual([
      "GarageSale",
      "Garden",
      "Moving",
      "OpenSource",
      "TodoTxt",
    ]);
  });

  test("plucks projects from completed records", async () => {
    const todos = createClient();

    expect(await todos.completed().projects()).toEqual([
      "GarageSale",
      "Moving",
      "OpenSource",
      "TodoTxt",
      "TodoTxtTouch",
    ]);
  });

  test("plucks contexts from pending records", async () => {
    const todos = createClient();

    expect(await todos.pending().contexts()).toEqual([
      "computer",
      "errands",
      "github",
      "hardware",
      "home",
      "phone",
    ]);
  });

  test("plucks contexts from completed records", async () => {
    const todos = createClient();

    expect(await todos.completed().contexts()).toEqual([
      "archive",
      "computer",
      "errands",
      "github",
      "home",
      "phone",
    ]);
  });

  test("lists contexts used by items in a project", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").contexts()).toEqual([
      "errands",
      "hardware",
      "home",
      "phone",
    ]);
  });

  test("lists contexts used by pending items in a project", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").pending().contexts()).toEqual([
      "errands",
      "hardware",
      "phone",
    ]);
  });

  test("lists contexts used by completed items in a project", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").completed().contexts()).toEqual([
      "home",
    ]);
  });

  test("lists projects used by items in a context", async () => {
    const todos = createClient();

    expect(await todos.context("home").projects()).toEqual([
      "GarageSale",
      "Garden",
      "Moving",
    ]);
  });

  test("lists projects used by pending items in a context", async () => {
    const todos = createClient();

    expect(await todos.context("home").pending().projects()).toEqual([
      "Garden",
      "Moving",
    ]);
  });

  test("lists projects used by completed items in a context", async () => {
    const todos = createClient();

    expect(await todos.context("home").completed().projects()).toEqual([
      "GarageSale",
    ]);
  });

  test("returns empty name lists for unknown projects and contexts", async () => {
    const todos = createClient();

    expect(await todos.project("Missing").contexts()).toEqual([]);
    expect(await todos.context("Missing").projects()).toEqual([]);
  });

  test("deduplicates names tagged twice on one item", async () => {
    const todos = createClient("(A) Shared task +Alpha +Alpha @home @home");

    expect(await todos.projects()).toEqual(["Alpha"]);
    expect(await todos.contexts()).toEqual(["home"]);
    expect(await todos.project("Alpha").contexts()).toEqual(["home"]);
    expect(await todos.context("home").projects()).toEqual(["Alpha"]);
  });

  test("completed plucks include projects with mixed item states", async () => {
    const todos = createClient();

    expect(await todos.completed().projects()).toContain("TodoTxt");
  });
});

describe("combined filters", () => {
  test("lists every record with both tags in file order", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt").context("computer");

    expect(descriptions(records)).toEqual([
      "Document task format",
      "Update README",
      "Write parser tests",
      "Publish v0.1",
    ]);
    expect(records.map((record) => record.completed)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  test("lists only pending records with both tags", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.project("TodoTxt").context("computer").pending()),
    ).toEqual(["Document task format", "Write parser tests"]);
  });

  test("lists only completed records with both tags", async () => {
    const todos = createClient();

    expect(
      descriptions(
        await todos.project("TodoTxt").context("computer").completed(),
      ),
    ).toEqual(["Update README", "Publish v0.1"]);
  });

  test("supports narrowing in either order", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.context("home").project("GarageSale")),
    ).toEqual(descriptions(await todos.project("GarageSale").context("home")));
  });

  test("returns an empty list when either name is unknown", async () => {
    const todos = createClient();

    expect(await todos.project("TodoTxt").context("Missing")).toEqual([]);
    expect(await todos.project("Missing").context("computer")).toEqual([]);
  });

  test("returns an empty list when the project and context never overlap", async () => {
    const todos = createClient();

    expect(await todos.project("TodoTxt").context("phone")).toEqual([]);
  });
});

describe("lazy reads", () => {
  test("chaining filters does no IO until awaited", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    const query = todos.pending().project("TodoTxt").context("computer");

    expect(readCalls).toBe(0);

    await query;

    expect(readCalls).toBe(1);
  });

  test("reads once per awaited record query", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.project("GarageSale").pending();

    expect(readCalls).toBe(1);
  });

  test("reads once per awaited name pluck", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.pending().projects();

    expect(readCalls).toBe(1);
  });
});

describe("asynchronous hooks", () => {
  test("supports async read hooks across the chain", async () => {
    const todos = createTodoTxt({
      read: async () => {
        await Promise.resolve();
        return [
          "x Done +Alpha @home",
          "Pending +Alpha @office",
          "x Also done +Beta @home",
        ].join("\n");
      },
      write: async () => {},
    });

    expect(await todos.all()).toHaveLength(3);
    expect(await todos.pending().projects()).toEqual(["Alpha"]);
    expect(await todos.project("Alpha").contexts()).toEqual(["home", "office"]);
    expect(await todos.project("Alpha").completed().contexts()).toEqual([
      "home",
    ]);
    expect(await todos.context("home").completed().projects()).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(
      descriptions(await todos.project("Alpha").context("office")),
    ).toEqual(["Pending"]);
  });
});

describe("source metadata", () => {
  function createSourceClient(contents: string): TodoTxtClient {
    return createTodoTxt({
      read: () => contents,
      write: () => {},
      includeSource: true,
    });
  }

  test("filters and chains preserve line and raw", async () => {
    const todos = createSourceClient(
      [
        "(A) Thank Mom for the meatballs @phone",
        "",
        "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
        "(B) Schedule Goodwill pickup +GarageSale @phone",
      ].join("\n"),
    );

    const phone = await todos.context("phone");

    expect(phone.map((record) => [record.line, record.raw])).toEqual([
      [1, "(A) Thank Mom for the meatballs @phone"],
      [4, "(B) Schedule Goodwill pickup +GarageSale @phone"],
    ]);

    expect(
      (await todos.pending().project("GarageSale")).map((record) => record.line),
    ).toEqual([4]);

    expect(await todos.completed()).toEqual([
      expect.objectContaining({
        line: 3,
        raw: "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
      }),
    ]);
  });
});

describe("priority filters", () => {
  test("lists every record with one priority in file order", async () => {
    const todos = createClient();

    expect(descriptions(await todos.priority("A"))).toEqual([
      "Thank Mom for the meatballs",
      "Buy paint",
      "Plant tomatoes",
    ]);
  });

  test("an array matches any listed priority", async () => {
    const todos = createClient();

    expect(descriptions(await todos.priority(["A", "C"]))).toEqual([
      "Thank Mom for the meatballs",
      "Buy paint",
      "Pack kitchen",
      "Plant tomatoes",
    ]);
  });

  test("matching is exact, so a lowercase letter matches nothing", async () => {
    const todos = createClient();

    expect(await todos.priority("a")).toEqual([]);
    expect(descriptions(await todos.priority(["a", "A"]))).toEqual(
      descriptions(await todos.priority("A")),
    );
  });

  test("repeated priority filters intersect", async () => {
    const todos = createClient();

    expect(await todos.priority("A").priority("B")).toEqual([]);
    expect(descriptions(await todos.priority(["A", "B"]).priority("B"))).toEqual(
      descriptions(await todos.priority("B")),
    );
  });

  test("composes with status and project filters", async () => {
    const todos = createClient();

    expect(descriptions(await todos.pending().priority("A"))).toEqual(
      descriptions(await todos.priority("A")),
    );
    expect(await todos.completed().priority("A")).toEqual([]);
    expect(descriptions(await todos.priority("A").project("Garden"))).toEqual([
      "Plant tomatoes",
    ]);
  });
});

describe("search filters", () => {
  test("matches substrings in the description case-insensitively by default", async () => {
    const todos = createClient();

    expect(descriptions(await todos.search("PR"))).toEqual([
      "Review PR",
      "Merge PR",
    ]);
    expect(descriptions(await todos.search("mom"))).toEqual([
      "Thank Mom for the meatballs",
    ]);
  });

  test("can match case-sensitively", async () => {
    const todos = createClient();

    expect(await todos.search("pr", { caseSensitive: true })).toEqual([]);
    expect(descriptions(await todos.search("Mom", { caseSensitive: true }))).toEqual([
      "Thank Mom for the meatballs",
    ]);
  });

  test("searches only the description, not metadata or dates", async () => {
    const todos = createClient();

    // `2011-03-05` appears as a leading date on line 4 and as the `due`
    // value, but neither survives into the description.
    expect(await todos.search("2011-03-05")).toEqual([]);
    expect(descriptions(await todos.search("2+2"))).toEqual([
      "Learn how to add 2+2",
    ]);
  });

  test("an empty needle matches every record", async () => {
    const todos = createClient();

    expect(await todos.search("")).toHaveLength(19);
  });

  test("composes with other filters", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.project("GarageSale").search("sign")),
    ).toEqual(["Post signs around the neighborhood"]);
    expect(
      descriptions(await todos.completed().search("PR")),
    ).toEqual(["Merge PR"]);
  });
});

describe("metadata filters", () => {
  test("meta(key) matches presence regardless of value", async () => {
    const todos = createClient();

    expect(descriptions(await todos.meta("due"))).toEqual([
      "Document task format",
    ]);
    expect(await todos.meta("missing")).toEqual([]);
  });

  test("meta(key, value) matches the exact value", async () => {
    const todos = createClient();

    expect(descriptions(await todos.meta("due", "2011-03-05"))).toEqual([
      "Document task format",
    ]);
    expect(await todos.meta("due", "2011-03-06")).toEqual([]);
  });

  test("hasMeta is the readable presence check", async () => {
    const todos = createClient();

    expect(descriptions(await todos.hasMeta("due"))).toEqual(
      descriptions(await todos.meta("due")),
    );
    expect(await todos.hasMeta("missing")).toEqual([]);
  });

  test("presence and value checks use own keys, never inherited ones", async () => {
    const todos = createClient(
      ["Shadowed toString:hi", "Plain task"].join("\n"),
    );

    expect(descriptions(await todos.hasMeta("toString"))).toEqual([
      "Shadowed",
    ]);
    expect(descriptions(await todos.meta("toString", "hi"))).toEqual([
      "Shadowed",
    ]);
    expect(await todos.hasMeta("constructor")).toEqual([]);
    expect(await todos.meta("valueOf")).toEqual([]);
  });

  test("composes with other filters", async () => {
    const todos = createClient([
      "(A) Call Mom who:alice",
      "Email Bob at bob@example.com who:bob",
      "Plain task",
    ].join("\n"));

    expect(descriptions(await todos.meta("who", "bob"))).toEqual([
      "Email Bob at bob@example.com",
    ]);
    expect(descriptions(await todos.pending().hasMeta("who"))).toEqual([
      "Call Mom",
      "Email Bob at bob@example.com",
    ]);
  });
});

describe("negation filters", () => {
  test("lists every record not tagged with the project", async () => {
    const todos = createClient();

    expect(await todos.notProject("Garden")).toHaveLength(17);
    expect(descriptions(await todos.notProject("Garden").search("tomatoes"))).toEqual(
      [],
    );
  });

  test("lists every record not tagged with the context", async () => {
    const todos = createClient();

    expect(await todos.notContext("phone")).toHaveLength(16);
    expect(descriptions(await todos.notContext("phone").search("paint"))).toEqual([
      "Buy paint",
    ]);
  });

  test("an array excludes every listed name", async () => {
    const todos = createClient();

    expect(await todos.notProject(["Garden", "Moving"])).toHaveLength(15);
  });

  test("repeated negation filters intersect", async () => {
    const todos = createClient();

    expect(
      await todos.notProject("Garden").notProject("Moving"),
    ).toHaveLength(15);
  });

  test("composes with other filters", async () => {
    const todos = createClient();

    expect(await todos.pending().notProject("Garden")).toHaveLength(10);
  });

  test("an empty array excludes nothing", async () => {
    const todos = createClient();

    expect(await todos.notProject([])).toHaveLength(19);
  });

  test("honors the per-call case-insensitive option", async () => {
    const todos = createClient();

    expect(await todos.notProject("garden")).toHaveLength(19);
    expect(
      await todos.notProject("garden", { caseSensitive: false }),
    ).toHaveLength(17);
  });
});

describe("array arguments", () => {
  test("a project array matches records in any listed project", async () => {
    const todos = createClient();

    expect(descriptions(await todos.project(["Garden", "Moving"]))).toEqual([
      "Order moving boxes",
      "Pack kitchen",
      "Plant tomatoes",
      "Weed the flower bed",
    ]);
  });

  test("a context array matches records in any listed context", async () => {
    const todos = createClient();

    expect(await todos.context(["phone", "computer"])).toHaveLength(7);
    expect(await todos.context(["phone", "Missing"])).toHaveLength(3);
  });

  test("repeated filters still require every name", async () => {
    const todos = createClient();

    expect(descriptions(await todos.project("TodoTxt").project("OpenSource"))).toEqual([
      "Write parser tests",
      "Publish v0.1",
    ]);
    expect(
      descriptions(await todos.project(["TodoTxt", "OpenSource"]).project("TodoTxt")),
    ).toEqual([
      "Document task format",
      "Update README",
      "Write parser tests",
      "Publish v0.1",
    ]);
  });

  test("an empty array matches nothing", async () => {
    const todos = createClient();

    expect(await todos.project([])).toEqual([]);
    expect(await todos.context([]).pending()).toEqual([]);
  });
});

describe("case-insensitive name matching", () => {
  test("per-call option overrides the exact default", async () => {
    const todos = createClient();

    expect(await todos.project("garden")).toEqual([]);
    expect(
      descriptions(await todos.project("garden", { caseSensitive: false })),
    ).toEqual(["Plant tomatoes", "Weed the flower bed"]);
    expect(await todos.context("COMPUTER", { caseSensitive: false })).toHaveLength(4);
  });

  test("client-level option changes the default for name queries", async () => {
    const todos = createTodoTxt({
      read: () => CONTENTS,
      write: () => {},
      caseSensitive: false,
    });

    expect(await todos.project("todotxt")).toHaveLength(4);
    expect(await todos.context("Computer")).toHaveLength(4);
  });

  test("per-call option re-enables exact matching on a client-level match", async () => {
    const todos = createTodoTxt({
      read: () => CONTENTS,
      write: () => {},
      caseSensitive: false,
    });

    expect(await todos.project("todotxt", { caseSensitive: true })).toEqual([]);
    expect(await todos.project("TodoTxt", { caseSensitive: true })).toHaveLength(4);
  });

  test("name plucks preserve original casing", async () => {
    const todos = createTodoTxt({
      read: () => CONTENTS,
      write: () => {},
      caseSensitive: false,
    });

    expect(await todos.projects()).toEqual([
      "GarageSale",
      "Garden",
      "Moving",
      "OpenSource",
      "TodoTxt",
      "TodoTxtTouch",
    ]);
  });
});

describe("date filters", () => {
  test("createdAfter matches strictly later creation dates", async () => {
    const todos = createClient();

    expect(descriptions(await todos.createdAfter("2011-03-01"))).toEqual([
      "Document task format",
      "Write parser tests",
    ]);
    expect(descriptions(await todos.createdAfter("2011-03-02"))).toEqual([
      "Write parser tests",
    ]);
  });

  test("createdBefore matches strictly earlier creation dates", async () => {
    const todos = createClient();

    expect(descriptions(await todos.createdBefore("2011-03-02"))).toEqual([
      "Review Tim's pull request",
      "Order moving boxes",
    ]);
  });

  test("records without the date never match", async () => {
    const todos = createClient();

    expect(await todos.createdAfter("1900-01-01")).toHaveLength(4);
    expect(await todos.createdBefore("9999-12-31")).toHaveLength(4);
  });

  test("completedAfter and completedBefore filter on the completion date", async () => {
    const todos = createClient();

    expect(descriptions(await todos.completedAfter("2024-01-12"))).toEqual([
      "Merge PR",
    ]);
    expect(descriptions(await todos.completedBefore("2011-03-05"))).toEqual([
      "Review Tim's pull request",
      "Update README",
    ]);
  });

  test("composes with other filters", async () => {
    const todos = createClient();

    expect(descriptions(await todos.pending().createdAfter("2011-01-01"))).toEqual([
      "Document task format",
      "Write parser tests",
    ]);
    expect(
      descriptions(await todos.completed().createdBefore("2011-03-05")),
    ).toEqual(["Review Tim's pull request", "Order moving boxes"]);
  });

  test("throws TypeError for invalid arguments without reading", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    expect(() => todos.createdAfter("2024-13-01")).toThrow(TypeError);
    expect(() => todos.createdBefore("not-a-date")).toThrow(TypeError);
    expect(() => todos.completedAfter("2024-02-30")).toThrow(TypeError);
    expect(() => todos.completedBefore("2024-1-1")).toThrow(TypeError);
    // 2024 is a leap year, so this bound is valid; 2023 is not.
    expect(() => todos.createdAfter("2023-02-29")).toThrow(TypeError);

    expect(readCalls).toBe(0);

    expect(await todos.createdAfter("2024-02-29")).toHaveLength(0);
    expect(readCalls).toBe(1);
  });
});

describe("count and first", () => {
  test("count() matches the length of the same query", async () => {
    const todos = createClient();

    expect(await todos.count()).toBe(19);
    expect(await todos.pending().count()).toBe(12);
    expect(await todos.completed().count()).toBe(7);
    expect(await todos.project("TodoTxt").count()).toBe(4);
    expect(await todos.project("TodoTxt").count()).toBe(
      (await todos.project("TodoTxt")).length,
    );
    expect(await todos.pending().completed().count()).toBe(0);
  });

  test("count() reads once through the cache", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.project("GarageSale").count();

    expect(readCalls).toBe(1);
  });

  test("first() returns the first record of the filtered result", async () => {
    const todos = createClient();

    expect((await todos.first())?.description).toBe(
      "Thank Mom for the meatballs",
    );
    expect((await todos.pending().first())?.description).toBe(
      "Thank Mom for the meatballs",
    );
    expect((await todos.project("GarageSale").first())?.description).toBe(
      "Schedule Goodwill pickup",
    );
  });

  test("first() resolves to undefined when nothing matches", async () => {
    const todos = createClient();

    expect(await todos.project("Missing").first()).toBeUndefined();
    expect(await todos.pending().completed().first()).toBeUndefined();
  });

  test("first() returns a copy that cannot mutate the cache", async () => {
    const todos = createClient();

    const first = await todos.first();
    first!.description = "Changed";
    first!.projects.push("Other");

    expect((await todos.first())?.description).toBe(
      "Thank Mom for the meatballs",
    );
    expect((await todos.first())?.projects).toEqual([]);
  });
});

describe("summary", () => {
  test("totals match pending() and completed() lengths", async () => {
    const todos = createClient();

    const summary = await todos.summary();

    expect(summary.total).toBe(19);
    expect(summary.pending).toBe((await todos.pending()).length);
    expect(summary.completed).toBe((await todos.completed()).length);
    expect(summary.pending + summary.completed).toBe(summary.total);
  });

  test("counts every project and context alphabetically", async () => {
    const todos = createClient();
    const summary = await todos.summary();

    expect(summary.projects).toEqual([
      { name: "GarageSale", counts: { pending: 3, completed: 1, total: 4 } },
      { name: "Garden", counts: { pending: 2, completed: 0, total: 2 } },
      { name: "Moving", counts: { pending: 1, completed: 1, total: 2 } },
      { name: "OpenSource", counts: { pending: 2, completed: 2, total: 4 } },
      { name: "TodoTxt", counts: { pending: 2, completed: 2, total: 4 } },
      { name: "TodoTxtTouch", counts: { pending: 0, completed: 1, total: 1 } },
    ]);

    expect(summary.contexts).toEqual([
      { name: "archive", counts: { pending: 0, completed: 2, total: 2 } },
      { name: "computer", counts: { pending: 2, completed: 2, total: 4 } },
      { name: "errands", counts: { pending: 2, completed: 1, total: 3 } },
      { name: "github", counts: { pending: 1, completed: 2, total: 3 } },
      { name: "hardware", counts: { pending: 2, completed: 0, total: 2 } },
      { name: "home", counts: { pending: 3, completed: 1, total: 4 } },
      { name: "phone", counts: { pending: 2, completed: 1, total: 3 } },
    ]);
  });

  test("name lists match the projects() and contexts() plucks", async () => {
    const todos = createClient();
    const summary = await todos.summary();

    expect(summary.projects.map((entry) => entry.name)).toEqual(
      await todos.projects(),
    );
    expect(summary.contexts.map((entry) => entry.name)).toEqual(
      await todos.contexts(),
    );
  });

  test("includes names that appear only on completed records", async () => {
    const todos = createClient();
    const summary = await todos.summary();

    expect(summary.projects).toContainEqual({
      name: "TodoTxtTouch",
      counts: { pending: 0, completed: 1, total: 1 },
    });
    expect(summary.contexts).toContainEqual({
      name: "archive",
      counts: { pending: 0, completed: 2, total: 2 },
    });
  });

  test("counts a multi-tag record once per name", async () => {
    const todos = createClient(
      [
        "(A) Shared task +Alpha +Beta @home @office",
        "Solo +Alpha @home",
        "x 2024-01-01 Done +Beta",
      ].join("\n"),
    );

    const summary = await todos.summary();

    expect(summary.total).toBe(3);
    expect(summary.projects).toEqual([
      { name: "Alpha", counts: { pending: 2, completed: 0, total: 2 } },
      { name: "Beta", counts: { pending: 1, completed: 1, total: 2 } },
    ]);
    expect(summary.contexts).toEqual([
      { name: "home", counts: { pending: 2, completed: 0, total: 2 } },
      { name: "office", counts: { pending: 1, completed: 0, total: 1 } },
    ]);

    // Per-name totals count multi-tag records once per name, so they do
    // not sum to the top-level total.
    const projectsTotal = summary.projects.reduce(
      (sum, entry) => sum + entry.counts.total,
      0,
    );

    expect(projectsTotal).toBe(4);
    expect(projectsTotal).not.toBe(summary.total);
  });

  test("does not double count a name tagged twice on one record", async () => {
    const todos = createClient("(A) Shared task +Alpha +Alpha @home @home");

    const summary = await todos.summary();

    expect(summary.projects).toEqual([
      { name: "Alpha", counts: { pending: 1, completed: 0, total: 1 } },
    ]);
    expect(summary.contexts).toEqual([
      { name: "home", counts: { pending: 1, completed: 0, total: 1 } },
    ]);
  });

  test("respects filter chains", async () => {
    const todos = createClient();

    const pending = await todos.pending().summary();

    expect(pending.total).toBe(12);
    expect(pending.pending).toBe(12);
    expect(pending.completed).toBe(0);
    expect(pending.projects.map((entry) => entry.name)).toEqual(
      await todos.pending().projects(),
    );
    expect(pending.projects.map((entry) => entry.name)).not.toContain(
      "TodoTxtTouch",
    );

    const completed = await todos.completed().summary();

    expect(completed.total).toBe(7);
    expect(completed.completed).toBe(7);
    expect(completed.pending).toBe(0);
  });

  test("summarizes a filtered subset of records", async () => {
    const todos = createClient();

    const summary = await todos.project("GarageSale").summary();

    expect(summary.total).toBe(4);
    expect(summary.pending).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.projects).toEqual([
      { name: "GarageSale", counts: { pending: 3, completed: 1, total: 4 } },
    ]);
    expect(summary.contexts.map((entry) => entry.name)).toEqual(
      await todos.project("GarageSale").contexts(),
    );
  });

  test("ignores sort steps like the name plucks", async () => {
    const todos = createClient();

    expect(await todos.sortBy("priority").summary()).toEqual(
      await todos.summary(),
    );
  });

  test("reads once through the cache", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.summary();
    await todos.countsByProject();
    await todos.countsByContext();

    expect(readCalls).toBe(1);
  });

  test("summarizes an empty file with zeroes and empty name lists", async () => {
    const todos = createClient("");

    expect(await todos.summary()).toEqual({
      total: 0,
      pending: 0,
      completed: 0,
      projects: [],
      contexts: [],
    });
  });
});

describe("counts by name", () => {
  test("countsByProject and countsByContext match summary at the root", async () => {
    const todos = createClient();
    const summary = await todos.summary();

    expect(await todos.countsByProject()).toEqual(summary.projects);
    expect(await todos.countsByContext()).toEqual(summary.contexts);
  });

  test("respects filter chains", async () => {
    const todos = createClient();

    const counts = await todos.project("GarageSale").countsByContext();

    expect(counts.map((entry) => entry.name)).toEqual(
      await todos.project("GarageSale").contexts(),
    );
    expect(counts).toEqual([
      { name: "errands", counts: { pending: 2, completed: 0, total: 2 } },
      { name: "hardware", counts: { pending: 1, completed: 0, total: 1 } },
      { name: "home", counts: { pending: 0, completed: 1, total: 1 } },
      { name: "phone", counts: { pending: 1, completed: 0, total: 1 } },
    ]);
  });

  test("pending counts contain no completed records", async () => {
    const todos = createClient();

    for (const entry of await todos.pending().countsByProject()) {
      expect(entry.counts.completed).toBe(0);
      expect(entry.counts.total).toBe(entry.counts.pending);
    }
  });

  test("returns an empty list when nothing matches", async () => {
    const todos = createClient();

    expect(await todos.project("Missing").countsByContext()).toEqual([]);
    expect(await todos.pending().completed().countsByProject()).toEqual([]);
  });
});
