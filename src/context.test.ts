import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";

const CONTENTS = [
  "(A) Thank Mom for the meatballs @phone",
  "(B) Schedule Goodwill pickup +GarageSale @phone",
  "Post signs around the neighborhood +GarageSale @errands",
  "2011-03-02 Document +TodoTxt task format due:2011-03-05 @computer",
  "x 2011-03-04 Update README +TodoTxt @computer",
  "x 2011-03-03 2011-03-01 Review Tim's pull request +TodoTxtTouch @github",
  "Learn how to add 2+2",
  "Email SoAndSo at soandso@example.com",
].join("\n");

function createClient(contents = CONTENTS): TodoTxtClient {
  return createTodoTxt({
    read: () => contents,
    write: () => {},
  });
}

describe("contexts", () => {
  test("lists every unique context name alphabetically", async () => {
    const todos = createClient();

    expect(await todos.contexts()).toEqual([
      "computer",
      "errands",
      "github",
      "phone",
    ]);
  });

  test("lists contexts that have at least one pending item", async () => {
    const todos = createClient();

    expect(await todos.contexts().pending()).toEqual([
      "computer",
      "errands",
      "phone",
    ]);
  });

  test("lists only contexts whose items are all completed", async () => {
    const todos = createClient();

    expect(await todos.contexts().completed()).toEqual(["github"]);
  });

  test("treats a context with mixed item states as pending only", async () => {
    const todos = createClient();

    expect(await todos.contexts().completed()).not.toContain("computer");
    expect(await todos.contexts().pending()).toContain("computer");
  });

  test("returns an empty list when there are no contexts", async () => {
    const todos = createClient("(A) Call Mom +Family");

    expect(await todos.contexts()).toEqual([]);
    expect(await todos.contexts().pending()).toEqual([]);
    expect(await todos.contexts().completed()).toEqual([]);
  });

  test("the last status call wins", async () => {
    const todos = createClient();

    expect(await todos.contexts().pending().completed()).toEqual(["github"]);
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

    await todos.contexts().pending();

    expect(readCalls).toBe(1);
  });
});

describe("context", () => {
  test("lists every item in the context, done and pending, in file order", async () => {
    const todos = createClient();
    const records = await todos.context("computer");

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      completed: false,
      description: "Document task format",
      contexts: ["computer"],
      data: { due: "2011-03-05" },
    });
    expect(records[1]).toMatchObject({
      completed: true,
      description: "Update README",
      contexts: ["computer"],
    });
  });

  test("lists only pending items", async () => {
    const todos = createClient();
    const records = await todos.context("computer").pending();

    expect(records).toHaveLength(1);
    expect(records[0]?.description).toBe("Document task format");
    expect(records[0]?.completed).toBe(false);
  });

  test("lists only completed items", async () => {
    const todos = createClient();
    const records = await todos.context("computer").completed();

    expect(records).toHaveLength(1);
    expect(records[0]?.description).toBe("Update README");
    expect(records[0]?.completed).toBe(true);
  });

  test("the last status call wins", async () => {
    const todos = createClient();

    expect(
      (await todos.context("computer").pending().completed()).map(
        (record) => record.description,
      ),
    ).toEqual(["Update README"]);
  });

  test("returns an empty list for an unknown context", async () => {
    const todos = createClient();

    expect(await todos.context("Missing")).toEqual([]);
    expect(await todos.context("Missing").pending()).toEqual([]);
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

  test("supports asynchronous read hooks", async () => {
    const todos = createTodoTxt({
      read: async () => {
        await Promise.resolve();
        return "x Done @Chores\nPending @Chores";
      },
      write: async () => {},
    });

    expect(await todos.contexts()).toEqual(["Chores"]);
    expect(await todos.contexts().pending()).toEqual(["Chores"]);
    expect(await todos.context("Chores").completed()).toHaveLength(1);
  });
});
