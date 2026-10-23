import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";

const CONTENTS = [
  "(A) Thank Mom for the meatballs @phone",
  "(B) Schedule Goodwill pickup +GarageSale @phone",
  "Post signs around the neighborhood +GarageSale",
  "2011-03-02 Document +TodoTxt task format due:2011-03-05",
  "x 2011-03-04 Update README +TodoTxt",
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

describe("projects", () => {
  test("lists every unique project name alphabetically", async () => {
    const todos = createClient();

    expect(await todos.projects()).toEqual([
      "GarageSale",
      "TodoTxt",
      "TodoTxtTouch",
    ]);
  });

  test("lists projects that have at least one pending item", async () => {
    const todos = createClient();

    expect(await todos.projects().pending()).toEqual([
      "GarageSale",
      "TodoTxt",
    ]);
  });

  test("lists only projects whose items are all completed", async () => {
    const todos = createClient();

    expect(await todos.projects().completed()).toEqual(["TodoTxtTouch"]);
  });

  test("treats a project with mixed item states as pending only", async () => {
    const todos = createClient();

    expect(await todos.projects().completed()).not.toContain("TodoTxt");
    expect(await todos.projects().pending()).toContain("TodoTxt");
  });

  test("returns an empty list when there are no projects", async () => {
    const todos = createClient("(A) Call Mom @phone");

    expect(await todos.projects()).toEqual([]);
    expect(await todos.projects().pending()).toEqual([]);
    expect(await todos.projects().completed()).toEqual([]);
  });

  test("the last status call wins", async () => {
    const todos = createClient();

    expect(await todos.projects().pending().completed()).toEqual([
      "TodoTxtTouch",
    ]);
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

    await todos.projects().pending();

    expect(readCalls).toBe(1);
  });
});

describe("project", () => {
  test("lists every item in the project, done and pending, in file order", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt");

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      completed: false,
      description: "Document task format",
      projects: ["TodoTxt"],
      data: { due: "2011-03-05" },
    });
    expect(records[1]).toMatchObject({
      completed: true,
      description: "Update README",
      projects: ["TodoTxt"],
    });
  });

  test("lists only pending items", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt").pending();

    expect(records).toHaveLength(1);
    expect(records[0]?.description).toBe("Document task format");
    expect(records[0]?.completed).toBe(false);
  });

  test("lists only completed items", async () => {
    const todos = createClient();
    const records = await todos.project("TodoTxt").completed();

    expect(records).toHaveLength(1);
    expect(records[0]?.description).toBe("Update README");
    expect(records[0]?.completed).toBe(true);
  });

  test("the last status call wins", async () => {
    const todos = createClient();

    expect(
      (await todos.project("TodoTxt").pending().completed()).map(
        (record) => record.description,
      ),
    ).toEqual(["Update README"]);
  });

  test("returns an empty list for an unknown project", async () => {
    const todos = createClient();

    expect(await todos.project("Missing")).toEqual([]);
    expect(await todos.project("Missing").pending()).toEqual([]);
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

  test("supports asynchronous read hooks", async () => {
    const todos = createTodoTxt({
      read: async () => {
        await Promise.resolve();
        return "x Done +Chores\nPending +Chores";
      },
      write: async () => {},
    });

    expect(await todos.projects()).toEqual(["Chores"]);
    expect(await todos.projects().pending()).toEqual(["Chores"]);
    expect(await todos.project("Chores").completed()).toHaveLength(1);
  });
});
