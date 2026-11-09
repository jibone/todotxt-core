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
