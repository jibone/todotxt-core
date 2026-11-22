import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";

const CONTENTS = [
  "(B) Write the sort docs due:2024-03-10",
  "2024-01-02 Add sort tests",
  "(A) Ship the sort feature due:2024-01-15",
  "(C) Tidy the README due:not-a-date",
  "2024-01-01 Design the comparator",
  "x 2024-06-01 2024-01-02 Release v0.5",
  "(Z) Overdue chore due:2023-12-31",
  "No dates at all",
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

describe("sortBy priority", () => {
  test("sorts A first through Z with nulls last", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortBy("priority"))).toEqual([
      "Ship the sort feature",
      "Write the sort docs",
      "Tidy the README",
      "Overdue chore",
      "Add sort tests",
      "Design the comparator",
      "Release v0.5",
      "No dates at all",
    ]);
  });

  test("reverses the letters but keeps nulls last for desc", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.sortBy("priority", "desc")),
    ).toEqual([
      "Overdue chore",
      "Tidy the README",
      "Write the sort docs",
      "Ship the sort feature",
      "Add sort tests",
      "Design the comparator",
      "Release v0.5",
      "No dates at all",
    ]);
  });

  test("sorts a filtered result without touching unsorted queries", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.pending().sortBy("priority")),
    ).toEqual([
      "Ship the sort feature",
      "Write the sort docs",
      "Tidy the README",
      "Overdue chore",
      "Add sort tests",
      "Design the comparator",
      "No dates at all",
    ]);
  });
});

describe("sortBy createdAt", () => {
  test("sorts earliest first with nulls last", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortBy("createdAt"))).toEqual([
      "Design the comparator",
      "Add sort tests",
      "Release v0.5",
      "Write the sort docs",
      "Ship the sort feature",
      "Tidy the README",
      "Overdue chore",
      "No dates at all",
    ]);
  });

  test("keeps ties in file order in both directions", async () => {
    const todos = createClient();

    // "Add sort tests" and "Release v0.5" share 2024-01-02 and keep file
    // order; nulls stay last for desc.
    expect(descriptions(await todos.sortBy("createdAt", "desc"))).toEqual([
      "Add sort tests",
      "Release v0.5",
      "Design the comparator",
      "Write the sort docs",
      "Ship the sort feature",
      "Tidy the README",
      "Overdue chore",
      "No dates at all",
    ]);
  });
});

describe("sortBy completedAt", () => {
  test("sorts the completed record before records without completion dates", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortBy("completedAt"))).toEqual([
      "Release v0.5",
      "Write the sort docs",
      "Add sort tests",
      "Ship the sort feature",
      "Tidy the README",
      "Design the comparator",
      "Overdue chore",
      "No dates at all",
    ]);
  });

  test("sorts within a completed filter", async () => {
    const todos = createClient(
      [
        "x 2024-06-01 Later",
        "x 2024-01-01 Earlier",
        "Pending",
      ].join("\n"),
    );

    expect(descriptions(await todos.completed().sortBy("completedAt"))).toEqual([
      "Earlier",
      "Later",
    ]);
    expect(
      descriptions(await todos.completed().sortBy("completedAt", "desc")),
    ).toEqual(["Later", "Earlier"]);
  });
});

describe("sortByMeta", () => {
  test("sorts metadata values as plain strings with missing keys last", async () => {
    const todos = createClient();

    // Plain string comparison: the due dates order chronologically and the
    // non-date value slots wherever its characters fall, not last.
    expect(descriptions(await todos.sortByMeta("due"))).toEqual([
      "Overdue chore",
      "Ship the sort feature",
      "Write the sort docs",
      "Tidy the README",
      "Add sort tests",
      "Design the comparator",
      "Release v0.5",
      "No dates at all",
    ]);
  });

  test("reverses the values but keeps missing keys last for desc", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortByMeta("due", "desc"))).toEqual([
      "Tidy the README",
      "Write the sort docs",
      "Ship the sort feature",
      "Overdue chore",
      "Add sort tests",
      "Design the comparator",
      "Release v0.5",
      "No dates at all",
    ]);
  });

  test("compares values as strings, not numbers", async () => {
    const todos = createClient(
      [
        "Shelf left part:2",
        "Shelf right part:10",
        "Shelf top part:1",
        "Sweep the floor",
      ].join("\n"),
    );

    // "10" sorts between "1" and "2" because the comparison is textual.
    expect(descriptions(await todos.sortByMeta("part"))).toEqual([
      "Shelf top",
      "Shelf right",
      "Shelf left",
      "Sweep the floor",
    ]);
  });

  test("records with equal values keep file order", async () => {
    const todos = createClient(
      ["First rank:2", "Second rank:1", "Third rank:2", "Fourth"].join("\n"),
    );

    expect(descriptions(await todos.sortByMeta("rank"))).toEqual([
      "Second",
      "First",
      "Third",
      "Fourth",
    ]);
  });

  test("an inherited name sorts as missing when no record carries it", async () => {
    const todos = createClient(
      ["Alpha toString:x1", "Beta", "Gamma toString:x3"].join("\n"),
    );

    // "Beta" has no own toString key. It must sort as missing — last in both
    // directions — not as the value of the inherited member.
    expect(descriptions(await todos.sortByMeta("toString"))).toEqual([
      "Alpha",
      "Gamma",
      "Beta",
    ]);
    expect(descriptions(await todos.sortByMeta("toString", "desc"))).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  test("a key no record carries leaves file order intact", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortByMeta("nada"))).toEqual(
      descriptions(await todos.all()),
    );
  });
});

describe("sortBy description", () => {
  test("sorts alphabetically", async () => {
    const todos = createClient();

    expect(descriptions(await todos.sortBy("description"))).toEqual([
      "Add sort tests",
      "Design the comparator",
      "No dates at all",
      "Overdue chore",
      "Release v0.5",
      "Ship the sort feature",
      "Tidy the README",
      "Write the sort docs",
    ]);
  });

  test("reverses the comparison but keeps equal descriptions in file order", async () => {
    const todos = createClient(
      [
        "(B) Polish examples",
        "Sort the tests",
        "Polish examples",
      ].join("\n"),
    );

    expect(descriptions(await todos.sortBy("description", "desc"))).toEqual([
      "Sort the tests",
      "Polish examples",
      "Polish examples",
    ]);
  });
});

describe("sortBy composition", () => {
  test("last call wins", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.sortBy("priority").sortBy("description")),
    ).toEqual(descriptions(await todos.sortBy("description")));
  });

  test("last call wins between sortBy and sortByMeta", async () => {
    const todos = createClient();

    expect(
      descriptions(await todos.sortBy("priority").sortByMeta("due")),
    ).toEqual(descriptions(await todos.sortByMeta("due")));
    expect(
      descriptions(await todos.sortByMeta("due").sortBy("priority")),
    ).toEqual(descriptions(await todos.sortBy("priority")));
  });

  test("sorting does not disturb the cached file order", async () => {
    const todos = createClient();

    await todos.sortBy("description");
    await todos.sortBy("priority", "desc");

    expect(descriptions(await todos.pending())).toEqual([
      "Write the sort docs",
      "Add sort tests",
      "Ship the sort feature",
      "Tidy the README",
      "Design the comparator",
      "Overdue chore",
      "No dates at all",
    ]);
  });

  test("name plucks ignore the sort step", async () => {
    const todos = createClient();

    expect(await todos.sortBy("description").projects()).toEqual(
      await todos.projects(),
    );
  });

  test("first() honors the sort step", async () => {
    const todos = createClient();

    expect((await todos.sortBy("priority").first())?.description).toBe(
      "Ship the sort feature",
    );
    expect((await todos.sortBy("priority", "desc").first())?.description).toBe(
      "Overdue chore",
    );
  });

  test("count() ignores the sort step", async () => {
    const todos = createClient();

    expect(await todos.sortBy("priority").count()).toBe(8);
  });
});
