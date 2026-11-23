import { isValidDate } from "./date.ts";
import { formatRecord } from "./format.ts";
import { parseLine } from "./parse.ts";
import type { TodoAddInput, TodoRecord } from "./types.ts";

/** Uppercase priority letter, exactly as the parser accepts it. */
const PRIORITY_PATTERN = /^[A-Z]$/;

/**
 * A parser-shaped description: non-empty tokens joined by single spaces.
 *
 * Every description the parser produces has this shape, because the parser
 * trims the line and rejoins whitespace-split tokens. Requiring it on write
 * input guarantees the description survives formatting verbatim instead of
 * silently normalizing, and keeps whitespace (including newlines) out of
 * what must stay a single physical line.
 */
const DESCRIPTION_PATTERN = /^\S+(?: \S+)*$/;

/** Project and context names: non-empty, no whitespace of any kind. */
const NAME_PATTERN = /^\S+$/;

/**
 * Metadata keys, matching the parser's extension grammar: non-empty and
 * free of whitespace and colons, so `key:value` splits back on the first
 * colon.
 */
const METADATA_KEY_PATTERN = /^[^:\s]+$/;

/** Metadata values: no whitespace, but empty is allowed (`key:` round-trips). */
const METADATA_VALUE_PATTERN = /^\S*$/;

function invalid(method: string, detail: string): never {
  throw new TypeError(`${method}() ${detail}`);
}

function validateNames(
  names: readonly string[],
  kind: "project" | "context",
  method: string,
): void {
  if (!Array.isArray(names)) {
    invalid(method, `expected ${kind}s to be an array of names.`);
  }

  for (const name of names) {
    if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      invalid(
        method,
        `expected each ${kind} name to be a non-empty string without whitespace, got ${JSON.stringify(name)}.`,
      );
    }
  }
}

function validateMetadata(
  data: Record<string, string>,
  method: string,
): void {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    invalid(method, "expected data to be a metadata object.");
  }

  for (const [key, value] of Object.entries(data)) {
    if (!METADATA_KEY_PATTERN.test(key)) {
      invalid(
        method,
        `expected each metadata key to be non-empty and free of whitespace and colons, got ${JSON.stringify(key)}.`,
      );
    }

    if (key === "__proto__") {
      invalid(
        method,
        'the metadata key "__proto__" is reserved: the parser never stores it, so it would be lost on reparse.',
      );
    }

    if (typeof value !== "string" || !METADATA_VALUE_PATTERN.test(value)) {
      invalid(
        method,
        `expected each metadata value to be a string without whitespace (empty is allowed), got ${JSON.stringify(value)}.`,
      );
    }
  }
}

/**
 * Guard the format-to-parse round trip for the line-prefix fields.
 *
 * The description is emitted verbatim, so a description whose leading tokens
 * look like todo.txt prefixes — `x`, `(A)`, or a real calendar date — is
 * consumed as one whenever it starts the line. Reparsing the formatted line
 * and comparing `completed`, `priority`, `completedAt`, and `createdAt`
 * catches every such masquerade exactly, including cases no explicit rule
 * spells out, while leaving tag-shaped tokens inside the description alone:
 * the parser extracting `re:` or a URL into metadata is a documented todo.txt
 * leniency, not a prefix problem.
 */
function checkPrefixRoundTrip<TData extends Record<string, string>>(
  record: TodoRecord<TData>,
  method: string,
): void {
  const line = formatRecord(record);
  const reparsed = parseLine(line);

  const fields = [
    ["completed", record.completed, reparsed.completed],
    ["priority", record.priority, reparsed.priority],
    ["completedAt", record.completedAt, reparsed.completedAt],
    ["createdAt", record.createdAt, reparsed.createdAt],
  ] as const;

  for (const [field, expected, actual] of fields) {
    if (expected !== actual) {
      invalid(
        method,
        `cannot write this record: the formatted line "${line}" reparses with ${field} = ${JSON.stringify(actual)} instead of ${JSON.stringify(expected)}. Reword the description or adjust the fields so the line's leading tokens are not read as completion markers, priorities, or dates.`,
      );
    }
  }
}

/**
 * Validate a full record supplied to a write API and return a clean copy.
 *
 * Every rule protects one guarantee: the canonical line
 * {@link formatRecord} emits must reparse into exactly the record fields
 * that produced it. Invalid content rejects with a `TypeError` naming the
 * field, matching the query APIs' argument validation. Source fields
 * (`line`, `raw`) are ignored — formatting works from the record fields.
 */
export function normalizeTodoRecord<TData extends Record<string, string>>(
  todo: TodoRecord<TData>,
  method: string,
): TodoRecord<TData> {
  if (todo === null || typeof todo !== "object") {
    invalid(method, "expected a record object.");
  }

  if (typeof todo.completed !== "boolean") {
    invalid(
      method,
      `expected completed to be a boolean, got ${typeof todo.completed}.`,
    );
  }

  if (todo.priority !== null) {
    if (
      typeof todo.priority !== "string" ||
      !PRIORITY_PATTERN.test(todo.priority)
    ) {
      invalid(
        method,
        `expected priority to be null or one uppercase letter A-Z, got ${JSON.stringify(todo.priority)}.`,
      );
    }

    if (todo.completed) {
      invalid(
        method,
        "a completed record cannot carry a priority: completed todo.txt lines never keep one, so it would be lost on reparse.",
      );
    }
  }

  for (const field of ["completedAt", "createdAt"] as const) {
    const value = todo[field];

    if (value === null) {
      continue;
    }

    if (typeof value !== "string" || !isValidDate(value)) {
      invalid(
        method,
        `expected ${field} to be null or a real calendar date in YYYY-MM-DD form, got ${JSON.stringify(value)}.`,
      );
    }
  }

  if (!todo.completed && todo.completedAt !== null) {
    invalid(
      method,
      "a pending record cannot carry completedAt: the formatted line would place the date first, where it reparses as a creation date.",
    );
  }

  if (
    typeof todo.description !== "string" ||
    !DESCRIPTION_PATTERN.test(todo.description)
  ) {
    invalid(
      method,
      `expected the description to be non-empty and whitespace-normalized (non-empty tokens joined by single spaces), got ${JSON.stringify(todo.description)}.`,
    );
  }

  validateNames(todo.projects, "project", method);
  validateNames(todo.contexts, "context", method);
  validateMetadata(todo.data, method);

  const record: TodoRecord<TData> = {
    completed: todo.completed,
    priority: todo.priority,
    completedAt: todo.completedAt,
    createdAt: todo.createdAt,
    description: todo.description,
    projects: [...todo.projects],
    contexts: [...todo.contexts],
    data: { ...todo.data },
  };

  checkPrefixRoundTrip(record, method);

  return record;
}

/**
 * Apply the {@link TodoTxtClient.add} defaults to a
 * {@link TodoAddInput} and validate the result.
 *
 * The `data` default re-enters through the same `TData` assertion the client
 * applies: nothing validates the keys at runtime.
 */
export function normalizeAddInput<TData extends Record<string, string>>(
  input: TodoAddInput<TData>,
  method: string,
): TodoRecord<TData> {
  if (input === null || typeof input !== "object") {
    // Runtime guard for untyped callers, so a null input gets this message
    // instead of an engine TypeError from the property access below.
    invalid(method, "expected an input object with a description.");
  }

  const data = (input.data ?? {}) as TData;

  return normalizeTodoRecord<TData>(
    {
      completed: input.completed ?? false,
      priority: input.priority ?? null,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt ?? null,
      description: input.description,
      projects: input.projects ?? [],
      contexts: input.contexts ?? [],
      data,
    },
    method,
  );
}

/**
 * Resolve the completion date for {@link TodoTxtClient.complete}.
 *
 * An explicit `date` wins; otherwise `today()` supplies the default. Both
 * paths must produce a real calendar date in `YYYY-MM-DD` form.
 */
export function resolveCompletionDate(
  date: string | undefined,
  today: () => string,
  method: string,
): string {
  const resolved = date ?? today();

  if (typeof resolved !== "string" || !isValidDate(resolved)) {
    invalid(
      method,
      `expected a real calendar date in YYYY-MM-DD form, got ${JSON.stringify(resolved)}.`,
    );
  }

  return resolved;
}
