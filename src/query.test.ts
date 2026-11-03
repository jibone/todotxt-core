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

describe("project().contexts()", () => {
  test("lists only contexts used by items in the project", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").contexts()).toEqual([
      "errands",
      "hardware",
      "home",
      "phone",
    ]);
  });

  test("lists contexts that have at least one pending item in the project", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").contexts().pending()).toEqual([
      "errands",
      "hardware",
      "phone",
    ]);
  });

  test("lists contexts whose items in the project are all completed", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").contexts().completed()).toEqual([
      "home",
    ]);
  });

  test("does not include contexts from other projects", async () => {
    const todos = createClient();

    expect(await todos.project("GarageSale").contexts()).not.toContain(
      "computer",
    );
    expect(await todos.project("TodoTxt").contexts()).toEqual(["computer"]);
  });

  test("returns empty lists for an unknown project", async () => {
    const todos = createClient();

    expect(await todos.project("Missing").contexts()).toEqual([]);
    expect(await todos.project("Missing").contexts().pending()).toEqual([]);
    expect(await todos.project("Missing").contexts().completed()).toEqual([]);
  });

  test("does not duplicate a context tagged twice on one item", async () => {
    const todos = createClient("(A) Shared task +Alpha @home @home");

    expect(await todos.project("Alpha").contexts()).toEqual(["home"]);
  });

  test("reads through the hook once per awaited query", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.project("GarageSale").contexts().pending();

    expect(readCalls).toBe(1);
  });
});

describe("context().projects()", () => {
  test("lists only projects used by items in the context", async () => {
    const todos = createClient();

    expect(await todos.context("home").projects()).toEqual([
      "GarageSale",
      "Garden",
      "Moving",
    ]);
  });

  test("lists projects that have at least one pending item in the context", async () => {
    const todos = createClient();

    expect(await todos.context("home").projects().pending()).toEqual([
      "Garden",
      "Moving",
    ]);
  });

  test("lists projects whose items in the context are all completed", async () => {
    const todos = createClient();

    expect(await todos.context("home").projects().completed()).toEqual([
      "GarageSale",
    ]);
  });

  test("does not include projects from other contexts", async () => {
    const todos = createClient();

    expect(await todos.context("home").projects()).not.toContain("TodoTxt");
    expect(await todos.context("archive").projects()).toEqual(["OpenSource"]);
  });

  test("returns empty lists for an unknown context", async () => {
    const todos = createClient();

    expect(await todos.context("Missing").projects()).toEqual([]);
    expect(await todos.context("Missing").projects().pending()).toEqual([]);
    expect(await todos.context("Missing").projects().completed()).toEqual([]);
  });

  test("does not duplicate a project tagged twice on one item", async () => {
    const todos = createClient("(A) Shared task @home +Alpha +Alpha");

    expect(await todos.context("home").projects()).toEqual(["Alpha"]);
  });

  test("reads through the hook once per awaited query", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.context("home").projects().completed();

    expect(readCalls).toBe(1);
  });
});

describe("project().context()", () => {
  test("lists every item with both tags, done and pending, in file order", async () => {
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

  test("lists only pending items", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt").context("computer").pending();

    expect(descriptions(records)).toEqual([
      "Document task format",
      "Write parser tests",
    ]);
    expect(records.every((record) => !record.completed)).toBe(true);
  });

  test("lists only completed items", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt").context("computer").completed();

    expect(descriptions(records)).toEqual(["Update README", "Publish v0.1"]);
    expect(records.every((record) => record.completed)).toBe(true);
  });

  test("returns both statuses when a project-context pair has only completed items", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.project("GarageSale").context("home")),
    ).toEqual(["Clean garage"]);
    expect(
      await todos.project("GarageSale").context("home").pending(),
    ).toEqual([]);
    expect(
      descriptions(await todos.project("GarageSale").context("home").completed()),
    ).toEqual(["Clean garage"]);
  });

  test("supports narrowing in either order", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.context("home").project("GarageSale")),
    ).toEqual(descriptions(await todos.project("GarageSale").context("home")));
  });

  test("the last status call wins", async () => {
    const todos = createClient();

    expect(
      descriptions(
        await todos
          .project("TodoTxt")
          .context("computer")
          .pending()
          .completed(),
      ),
    ).toEqual(["Update README", "Publish v0.1"]);
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

  test("reads through the hook once per awaited query", async () => {
    let readCalls = 0;
    const todos = createTodoTxt({
      read: () => {
        readCalls += 1;
        return CONTENTS;
      },
      write: () => {},
    });

    await todos.project("TodoTxt").context("computer").pending();

    expect(readCalls).toBe(1);
  });
});

describe("status carry-over between views", () => {
  test("project pending status carries into contexts", async () => {
    const todos = createClient();

    expect(
      await todos.project("GarageSale").pending().contexts(),
    ).toEqual(await todos.project("GarageSale").contexts().pending());
  });

  test("project completed status carries into contexts", async () => {
    const todos = createClient();

    expect(
      await todos.project("GarageSale").completed().contexts(),
    ).toEqual(await todos.project("GarageSale").contexts().completed());
  });

  test("context pending status carries into projects", async () => {
    const todos = createClient();

    expect(
      await todos.context("home").pending().projects(),
    ).toEqual(await todos.context("home").projects().pending());
  });

  test("context completed status carries into projects", async () => {
    const todos = createClient();

    expect(
      await todos.context("home").completed().projects(),
    ).toEqual(await todos.context("home").projects().completed());
  });

  test("the last status call wins on a name list", async () => {
    const todos = createClient();

    expect(
      await todos.project("GarageSale").contexts().pending().completed(),
    ).toEqual(["home"]);
  });
});

describe("cross queries with asynchronous hooks", () => {
  test("supports async read hooks", async () => {
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

    expect(await todos.project("Alpha").contexts()).toEqual(["home", "office"]);
    expect(await todos.project("Alpha").contexts().completed()).toEqual([
      "home",
    ]);
    expect(await todos.context("home").projects().completed()).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(
      descriptions(await todos.project("Alpha").context("office")),
    ).toEqual(["Pending"]);
  });
});
