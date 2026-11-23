import { describe, expect, test } from "bun:test";
import { createTodoTxt } from "./client.ts";
import type { TodoTxtClient } from "./client.ts";
import { isValidDate } from "./date.ts";
import { TodoWriteError } from "./errors.ts";
import type { TodoClientOptions, TodoRecord } from "./types.ts";

/**
 * A write-enabled client over an in-memory string.
 *
 * `today` is pinned so completion dates are deterministic; tests that care
 * about the real clock create their client directly.
 */
function createHarness(
  initial: string,
  options: Omit<TodoClientOptions, "read" | "write"> = {},
): {
  todos: TodoTxtClient;
  contents: string;
  readCalls: number;
} {
  let contents = initial;
  let readCalls = 0;
  const todos = createTodoTxt({
    read: () => {
      readCalls += 1;
      return contents;
    },
    write: (next: string) => {
      contents = next;
    },
    today: () => "2026-11-22",
    ...options,
  });

  return {
    todos,
    get contents() {
      return contents;
    },
    set contents(value: string) {
      contents = value;
    },
    get readCalls() {
      return readCalls;
    },
  };
}

const capture = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error) => error,
  );

describe("add", () => {
  test("appends a canonical line and returns the record", async () => {
    const harness = createHarness("(A) First\n");

    const added = await harness.todos.add({
      description: "Call Mom",
      priority: "B",
      projects: ["Family"],
    });

    expect(harness.contents).toBe("(A) First\n(B) Call Mom +Family\n");
    expect(added).toEqual({
      completed: false,
      priority: "B",
      completedAt: null,
      createdAt: null,
      description: "Call Mom",
      projects: ["Family"],
      contexts: [],
      data: {},
      line: 2,
    });
  });

  test("applies the documented defaults", async () => {
    const harness = createHarness("");

    const added = await harness.todos.add({ description: "Task" });

    expect(harness.contents).toBe("Task\n");
    expect(added).toEqual({
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "Task",
      projects: [],
      contexts: [],
      data: {},
      line: 1,
    });
  });

  test("appends after trailing blank lines, preserving them", async () => {
    const harness = createHarness("First\n\n\n");

    await harness.todos.add({ description: "Task" });

    expect(harness.contents).toBe("First\n\n\nTask\n");
  });

  test("adds a trailing newline to a file without one", async () => {
    const harness = createHarness("First");

    await harness.todos.add({ description: "Task" });

    expect(harness.contents).toBe("First\nTask\n");
  });

  test("keeps the file's CRLF line endings", async () => {
    const harness = createHarness("First\r\n");

    await harness.todos.add({ description: "Task" });

    expect(harness.contents).toBe("First\r\nTask\r\n");
  });

  test("accepts a pre-completed record", async () => {
    const harness = createHarness("");

    const added = await harness.todos.add({
      description: "Done",
      completed: true,
      completedAt: "2011-03-03",
    });

    expect(harness.contents).toBe("x 2011-03-03 Done\n");
    expect(added.completed).toBe(true);
    expect(added.completedAt).toBe("2011-03-03");
  });

  test("accepts a bare completed record without a date", async () => {
    const harness = createHarness("");

    const added = await harness.todos.add({
      description: "Done",
      completed: true,
    });

    expect(harness.contents).toBe("x Done\n");
    expect(added.completedAt).toBeNull();
  });

  test("appends sequentially through the write queue", async () => {
    const harness = createHarness("");

    await harness.todos.add({ description: "First" });
    await harness.todos.add({ description: "Second", priority: "A" });

    expect(harness.contents).toBe("First\n(A) Second\n");
  });
});

describe("add validation", () => {
  test("rejects an empty description", async () => {
    const harness = createHarness("");

    const failure = await capture(harness.todos.add({ description: "" }));

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /expected the description to be non-empty/,
    );
  });

  test("rejects a description that is not whitespace-normalized", async () => {
    const harness = createHarness("");

    const failure = await capture(
      harness.todos.add({ description: "Call  Mom" }),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(/whitespace-normalized/);
  });

  test("rejects invalid dates", async () => {
    const harness = createHarness("");

    const failure = await capture(
      harness.todos.add({ description: "Task", createdAt: "2024-02-30" }),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /expected createdAt to be null or a real calendar date/,
    );
  });

  test("rejects a lowercase or multi-letter priority", async () => {
    const harness = createHarness("");

    const lowercase = await capture(
      harness.todos.add({ description: "Task", priority: "a" }),
    );
    const multi = await capture(
      harness.todos.add({ description: "Task", priority: "AB" }),
    );

    expect(lowercase).toBeInstanceOf(TypeError);
    expect((lowercase as Error).message).toMatch(/one uppercase letter A-Z/);
    expect(multi).toBeInstanceOf(TypeError);
  });

  test("rejects whitespace in project and context names", async () => {
    const harness = createHarness("");

    const project = await capture(
      harness.todos.add({ description: "Task", projects: ["New York"] }),
    );
    const context = await capture(
      harness.todos.add({ description: "Task", contexts: ["a b"] }),
    );

    expect(project).toBeInstanceOf(TypeError);
    expect((project as Error).message).toMatch(
      /expected each project name to be a non-empty string without whitespace/,
    );
    expect(context).toBeInstanceOf(TypeError);
    expect((context as Error).message).toMatch(/expected each context name/);
  });

  test("rejects malformed metadata keys and values", async () => {
    const harness = createHarness("");

    const spacedKey = await capture(
      harness.todos.add({ description: "Task", data: { "a b": "1" } }),
    );
    const colonKey = await capture(
      harness.todos.add({ description: "Task", data: { "a:b": "1" } }),
    );
    const reservedKey = await capture(
      harness.todos.add({ description: "Task", data: { ["__proto__"]: "1" } }),
    );
    const spacedValue = await capture(
      harness.todos.add({ description: "Task", data: { due: "a b" } }),
    );

    expect(spacedKey).toBeInstanceOf(TypeError);
    expect((spacedKey as Error).message).toMatch(/expected each metadata key/);
    expect(colonKey).toBeInstanceOf(TypeError);
    expect(reservedKey).toBeInstanceOf(TypeError);
    expect((reservedKey as Error).message).toMatch(/__proto__.*reserved/);
    expect(spacedValue).toBeInstanceOf(TypeError);
    expect((spacedValue as Error).message).toMatch(
      /expected each metadata value/,
    );
  });

  test("rejects completedAt on a pending record", async () => {
    const harness = createHarness("");

    const failure = await capture(
      harness.todos.add({ description: "Task", completedAt: "2011-03-03" }),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /a pending record cannot carry completedAt/,
    );
  });

  test("rejects a priority on a completed record", async () => {
    const harness = createHarness("");

    const failure = await capture(
      harness.todos.add({
        description: "Task",
        completed: true,
        completedAt: "2011-03-03",
        priority: "A",
      }),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /a completed record cannot carry a priority/,
    );
  });

  test("rejects a description that would reparse as a prefix", async () => {
    const harness = createHarness("");

    const completed = await capture(
      harness.todos.add({ description: "x Call Mom" }),
    );
    const priority = await capture(
      harness.todos.add({ description: "(A) Call Mom" }),
    );
    const created = await capture(
      harness.todos.add({ description: "2011-03-02 Call Mom" }),
    );

    for (const failure of [completed, priority, created]) {
      expect(failure).toBeInstanceOf(TypeError);
      expect((failure as Error).message).toMatch(/cannot write this record/);
    }

    expect((completed as Error).message).toMatch(/completed = true/);
    expect((priority as Error).message).toMatch(/priority = "A"/);
    expect((created as Error).message).toMatch(/createdAt = "2011-03-02"/);
  });

  test("allows tag-shaped tokens inside the description", async () => {
    // A URL becomes `http:` metadata on reparse — a documented todo.txt
    // leniency, not a prefix problem, so it is written as given.
    const harness = createHarness("");

    const added = await harness.todos.add({
      description: "Read http://example.com/article",
    });

    expect(harness.contents).toBe("Read http://example.com/article\n");
    expect(added.data["http"]).toBe("//example.com/article");
    expect(added.description).toBe("Read");
  });

  test("rejects before any read happens", async () => {
    const harness = createHarness("Task\n");

    await capture(harness.todos.add({ description: "" }));

    expect(harness.readCalls).toBe(0);
  });
});

describe("update", () => {
  test("replaces only the target line, keeping the others byte-identical", async () => {
    const harness = createHarness(
      "First\n(B) Second   +b +a @z @y z:1 a:2\nThird\n",
    );

    const second = (await harness.todos.all())[1]!;
    await harness.todos.update({
      ...second,
      description: "Second updated",
      priority: "A",
    });

    expect(harness.contents).toBe(
      [
        "First",
        "(A) Second updated +a +b @y @z a:2 z:1",
        "Third",
        "",
      ].join("\n"),
    );
  });

  test("returns the record as it now exists in the file", async () => {
    const harness = createHarness("(A) Call Mom\n");

    const updated = await harness.todos.update({
      ...(await harness.todos.all())[0]!,
      description: "Call Dad",
    });

    expect(updated).toEqual({
      completed: false,
      priority: "A",
      completedAt: null,
      createdAt: null,
      description: "Call Dad",
      projects: [],
      contexts: [],
      data: {},
      line: 1,
    });
  });

  test("accepts the record returned by a previous write", async () => {
    const harness = createHarness("");

    const added = await harness.todos.add({ description: "Task" });
    const updated = await harness.todos.update({
      ...added,
      description: "Renamed",
    });

    expect(harness.contents).toBe("Renamed\n");
    expect(updated.description).toBe("Renamed");
  });

  test("rejects a record without a line", async () => {
    const harness = createHarness("Task\n");

    const failure = await capture(
      harness.todos.update({
        completed: false,
        priority: null,
        completedAt: null,
        createdAt: null,
        description: "Task",
        projects: [],
        contexts: [],
        data: {},
      }),
    );

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /requires a record carrying its line number/,
    );
  });

  test("rejects a line that holds no todo", async () => {
    const harness = createHarness("First\n\nThird\n");

    const first = (await harness.todos.all())[0]!;
    const failure = await capture(
      harness.todos.update({ ...first, line: 2 }),
    );

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(/found no todo at line 2/);
  });

  test("rejects a line beyond the document", async () => {
    const harness = createHarness("Task\n");

    const record = (await harness.todos.all())[0]!;
    const failure = await capture(
      harness.todos.update({ ...record, line: 99 }),
    );

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(/found no todo at line 99/);
  });

  test("keeps the target line's own EOL", async () => {
    const harness = createHarness("First\nSecond\r\n");

    const second = (await harness.todos.all())[1]!;
    await harness.todos.update({ ...second, description: "Renamed" });

    expect(harness.contents).toBe("First\nRenamed\r\n");
  });

  test("keeps a missing trailing newline on the last line", async () => {
    const harness = createHarness("First\nSecond");

    const second = (await harness.todos.all())[1]!;
    await harness.todos.update({ ...second, description: "Renamed" });

    expect(harness.contents).toBe("First\nRenamed");
  });

  test("validates the record content", async () => {
    const harness = createHarness("(A) Call Mom\n");

    const record = (await harness.todos.all())[0]!;
    const failure = await capture(
      harness.todos.update({ ...record, priority: "a" }),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(/one uppercase letter A-Z/);
    expect(harness.contents).toBe("(A) Call Mom\n");
  });
});

describe("complete", () => {
  test("marks the todo completed with today's date and drops the priority", async () => {
    const harness = createHarness("(A) Call Mom @phone\n");

    const mom = (await harness.todos.all())[0]!;
    const done = await harness.todos.complete(mom);

    expect(harness.contents).toBe("x 2026-11-22 Call Mom @phone\n");
    expect(done).toEqual({
      completed: true,
      priority: null,
      completedAt: "2026-11-22",
      createdAt: null,
      description: "Call Mom",
      projects: [],
      contexts: ["phone"],
      data: {},
      line: 1,
    });
  });

  test("accepts an explicit completion date", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const done = await harness.todos.complete(mom, "2026-11-20");

    expect(harness.contents).toBe("x 2026-11-20 Call Mom\n");
    expect(done.completedAt).toBe("2026-11-20");
  });

  test("rejects an invalid explicit date", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const failure = await capture(harness.todos.complete(mom, "2026-02-30"));

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /expected a real calendar date in YYYY-MM-DD form/,
    );
    expect(harness.contents).toBe("Call Mom\n");
  });

  test("defaults to the system clock's local date", async () => {
    let contents = "Call Mom\n";
    const todos = createTodoTxt({
      read: () => contents,
      write: (next: string) => {
        contents = next;
      },
    });

    const done = await todos.complete((await todos.all())[0]!);

    expect(done.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidDate(done.completedAt!)).toBe(true);
    expect(contents).toBe(`x ${done.completedAt} Call Mom\n`);
  });

  test("rejects a today hook that returns a non-date", async () => {
    const harness = createHarness("Call Mom\n", { today: () => "nope" });

    const mom = (await harness.todos.all())[0]!;
    const failure = await capture(harness.todos.complete(mom));

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(/got "nope"/);
  });

  test("rejects an already-completed todo", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const done = await harness.todos.complete(mom);
    const failure = await capture(harness.todos.complete(done));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(/already completed/);
  });

  test("rejects a record that no longer matches the file", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    harness.contents = "Call Dad\n";

    const failure = await capture(harness.todos.complete(mom));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /found a different todo at line 1/,
    );
    expect(harness.contents).toBe("Call Dad\n");
  });

  test("rejects a record without a line", async () => {
    const harness = createHarness("Call Mom\n");

    const lineless = (await harness.todos.all())[0]!;
    delete lineless.line;

    const failure = await capture(harness.todos.complete(lineless));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /requires a record carrying its line number/,
    );
  });
});

describe("uncomplete", () => {
  test("removes the x marker and the completion date", async () => {
    const harness = createHarness("x 2011-03-03 Done +Chores\n");

    const done = (await harness.todos.all())[0]!;
    const pending = await harness.todos.uncomplete(done);

    expect(harness.contents).toBe("Done +Chores\n");
    expect(pending).toEqual({
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "Done",
      projects: ["Chores"],
      contexts: [],
      data: {},
      line: 1,
    });
  });

  test("rejects a pending todo", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const failure = await capture(harness.todos.uncomplete(mom));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(/still pending/);
  });

  test("rejects a record that no longer matches the file", async () => {
    const harness = createHarness("x 2011-03-03 Done\n");

    const done = (await harness.todos.all())[0]!;
    harness.contents = "x 2011-03-04 Done\n";

    const failure = await capture(harness.todos.uncomplete(done));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /found a different todo at line 1/,
    );
  });

  test("rejects a line that would format to nothing, before any write", async () => {
    const harness = createHarness("x \n");

    const done = (await harness.todos.all())[0]!;
    const failure = await capture(harness.todos.uncomplete(done));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /would format to an empty line/,
    );
    expect(harness.contents).toBe("x \n");
  });

  test("rejects a date-only completed line", async () => {
    const harness = createHarness("x 2011-03-03\n");

    const done = (await harness.todos.all())[0]!;
    const failure = await capture(harness.todos.uncomplete(done));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect(harness.contents).toBe("x 2011-03-03\n");
  });

  test("keeps a description-less todo whose tags survive", async () => {
    const harness = createHarness("x 2011-03-03 +Chores\n");

    const done = (await harness.todos.all())[0]!;
    const pending = await harness.todos.uncomplete(done);

    expect(harness.contents).toBe("+Chores\n");
    expect(pending).toEqual({
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "",
      projects: ["Chores"],
      contexts: [],
      data: {},
      line: 1,
    });
  });

  test("keeps a creation date when the completion date is removed", async () => {
    const harness = createHarness("x 2011-03-03 2011-03-02\n");

    const done = (await harness.todos.all())[0]!;
    const pending = await harness.todos.uncomplete(done);

    expect(harness.contents).toBe("2011-03-02\n");
    expect(pending.createdAt).toBe("2011-03-02");
    expect(pending.description).toBe("");
  });
});

describe("delete", () => {
  test("removes the line and returns the record as it was", async () => {
    const harness = createHarness("First\nSecond\nThird\n");

    const second = (await harness.todos.all())[1]!;
    const removed = await harness.todos.delete(second);

    expect(harness.contents).toBe("First\nThird\n");
    expect(removed).toEqual({
      ...second,
    });
  });

  test("preserves blank lines elsewhere", async () => {
    const harness = createHarness("First\n\nThird\n");

    const first = (await harness.todos.all())[0]!;
    await harness.todos.delete(first);

    expect(harness.contents).toBe("\nThird\n");
  });

  test("renumbers the following records", async () => {
    const harness = createHarness("First\nSecond\nThird\n");

    const second = (await harness.todos.all())[1]!;
    await harness.todos.delete(second);

    const after = await harness.todos.all();
    expect(after.map((record) => record.line)).toEqual([1, 2]);
    expect(after.map((record) => record.description)).toEqual([
      "First",
      "Third",
    ]);
  });

  test("rejects a record that no longer matches the file", async () => {
    const harness = createHarness("First\n");

    const first = (await harness.todos.all())[0]!;
    harness.contents = "Changed\n";

    const failure = await capture(harness.todos.delete(first));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as Error).message).toMatch(
      /found a different todo at line 1/,
    );
  });

  test("accepts the record returned by a previous write", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const done = await harness.todos.complete(mom);
    await harness.todos.delete(done);

    expect(harness.contents).toBe("");
  });
});

describe("write hook contract", () => {
  test("every write method rejects without a write hook", async () => {
    const todos = createTodoTxt({ read: () => "Call Mom\n" });
    const record: TodoRecord = {
      completed: false,
      priority: null,
      completedAt: null,
      createdAt: null,
      description: "Call Mom",
      projects: [],
      contexts: [],
      data: {},
      line: 1,
    };

    for (const failure of [
      await capture(todos.add({ description: "Task" })),
      await capture(todos.update(record)),
      await capture(todos.complete(record)),
      await capture(todos.uncomplete({ ...record, completed: true })),
      await capture(todos.delete(record)),
    ]) {
      expect(failure).toBeInstanceOf(TodoWriteError);
      expect((failure as Error).message).toMatch(/no write hook/);
    }
  });

  test("propagates write-hook Errors untouched", async () => {
    let contents = "Call Mom\n";
    const failure = new Error("disk full");
    const todos = createTodoTxt({
      read: () => contents,
      write: () => {
        throw failure;
      },
      today: () => "2026-11-22",
    });

    const caught = await capture(todos.add({ description: "Task" }));

    expect(caught).toBe(failure);
    expect(caught).not.toBeInstanceOf(TodoWriteError);
    expect(contents).toBe("Call Mom\n");
  });

  test("wraps non-Error rejections in a TodoWriteError with cause", async () => {
    let contents = "Call Mom\n";
    const todos = createTodoTxt({
      read: () => contents,
      write: () => Promise.reject("nope"),
      today: () => "2026-11-22",
    });

    const failure = await capture(todos.add({ description: "Task" }));

    expect(failure).toBeInstanceOf(TodoWriteError);
    expect((failure as TodoWriteError).cause).toBe("nope");
    expect(contents).toBe("Call Mom\n");
  });

  test("leaves the cache and warnings untouched after a failed write", async () => {
    const todos = createTodoTxt({
      read: () => "Task k:1 k:2\n",
      write: () => {
        throw new Error("disk full");
      },
      today: () => "2026-11-22",
    });

    await todos.all();
    expect(todos.warnings()).toHaveLength(1);

    await capture(todos.add({ description: "Another" }));

    expect(await todos.pending()).toHaveLength(1);
    expect(todos.warnings()).toHaveLength(1);
  });
});

describe("invalid record arguments", () => {
  test("update/complete/uncomplete/delete reject null records", async () => {
    const harness = createHarness("Task\n");

    const failures = [
      await capture(harness.todos.update(null as never)),
      await capture(harness.todos.complete(null as never)),
      await capture(harness.todos.uncomplete(null as never)),
      await capture(harness.todos.delete(null as never)),
    ];

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(TodoWriteError);
      expect((failure as Error).message).toMatch(
        /requires a record carrying its line number/,
      );
    }

    expect(harness.contents).toBe("Task\n");
  });

  test("add rejects a null input", async () => {
    const harness = createHarness("");

    const failure = await capture(harness.todos.add(null as never));

    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(
      /expected an input object with a description/,
    );
    expect(harness.readCalls).toBe(0);
  });
});

describe("cache coherence", () => {
  test("queries reflect a write without re-reading", async () => {
    const harness = createHarness("First\n");

    await harness.todos.all();
    await harness.todos.add({ description: "Second" });

    const pending = await harness.todos.pending();

    expect(pending.map((record) => record.description)).toEqual([
      "First",
      "Second",
    ]);
    expect(harness.readCalls).toBe(2);
  });

  test("refreshes warnings from the written document", async () => {
    const harness = createHarness("First k:1 k:2\n");

    await harness.todos.all();
    expect(harness.todos.warnings()).toHaveLength(1);

    const first = (await harness.todos.all())[0]!;
    await harness.todos.update({ ...first, data: {} });

    expect(harness.contents).toBe("First\n");
    expect(harness.todos.warnings()).toHaveLength(0);
  });

  test("attaches line but not raw on write-enabled clients", async () => {
    const harness = createHarness("(A) Call Mom\n");

    const records = await harness.todos.all();

    expect(records[0]).toHaveProperty("line", 1);
    expect(records[0]).not.toHaveProperty("raw");
  });

  test("attaches both line and raw with includeSource", async () => {
    const harness = createHarness("(A) Call Mom\n", { includeSource: true });

    const record = (await harness.todos.all())[0]!;

    expect(record.line).toBe(1);
    expect(record.raw).toBe("(A) Call Mom");
  });

  test("read-only clients attach neither line nor raw", async () => {
    const todos = createTodoTxt({ read: () => "(A) Call Mom\n" });

    const records = await todos.all();

    expect(records[0]).not.toHaveProperty("line");
    expect(records[0]).not.toHaveProperty("raw");
  });
});

describe("concurrency", () => {
  test("serializes concurrent updates in call order", async () => {
    const harness = createHarness("Task\n");

    const base = (await harness.todos.all())[0]!;
    await Promise.all([
      harness.todos.update({ ...base, description: "First edit" }),
      harness.todos.update({ ...base, description: "Second edit" }),
    ]);

    expect(harness.contents).toBe("Second edit\n");
  });

  test("rejects a state change whose record a prior write changed", async () => {
    const harness = createHarness("Call Mom\n");

    const mom = (await harness.todos.all())[0]!;
    const results = await Promise.allSettled([
      harness.todos.complete(mom),
      harness.todos.delete(mom),
    ]);

    expect(results[0]?.status).toBe("fulfilled");

    const deleted = results[1];
    expect(deleted?.status).toBe("rejected");

    if (deleted?.status === "rejected") {
      expect(deleted.reason).toBeInstanceOf(TodoWriteError);
      expect((deleted.reason as Error).message).toMatch(
        /found a different todo at line 1/,
      );
    }

    expect(harness.contents).toBe("x 2026-11-22 Call Mom\n");
  });
});
