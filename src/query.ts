import { cloneRecord, cloneRecords } from "./clone.ts";
import { isValidDate } from "./date.ts";
import type { TodoRecord } from "./types.ts";

/** A predicate applied to every record in a query. */
export type TodoFilter = (todo: TodoRecord) => boolean;

/** Loads and parses every todo.txt record. */
export type LoadRecords = () => Promise<TodoRecord[]>;

/** Fields that {@link TodoQuery.sortBy} can order results by. */
export type TodoSortField =
  | "priority"
  | "createdAt"
  | "completedAt"
  | "description"
  | "due";

/** Sort direction for {@link TodoQuery.sortBy}. Default: `"asc"`. */
export type TodoSortDirection = "asc" | "desc";

/**
 * Per-call matching options.
 *
 * `caseSensitive` overrides the client-level default for one call. The default
 * differs per method: project and context matching is exact and case-sensitive
 * unless the option says otherwise, while search is case-insensitive unless the
 * option says otherwise.
 */
export interface TodoMatchOptions {
  /** Compare case-sensitively (or, for search, insensitively) for this call. */
  caseSensitive?: boolean;
}

/** One ordering step appended by {@link TodoQuery.sortBy}. */
export interface TodoSortSpec {
  field: TodoSortField;
  direction: TodoSortDirection;
}

/** Internal query state: AND-composed filters plus one optional sort step. */
export interface TodoQueryState {
  filters: TodoFilter[];
  sort?: TodoSortSpec;
  /**
   * Client-level default for name matching. Search is unaffected: it stays
   * case-insensitive by default no matter what this says.
   */
  caseSensitive: boolean;
}

/**
 * A lazy query over parsed todo records.
 *
 * Filters return a new query and perform no IO. Awaiting a query resolves
 * through the supplied loader; the client caches parsed records, so only the
 * first query reads the file. Filters compose with AND: every predicate added
 * to the chain must match. Array arguments are OR within a single call, so
 * `project(["A", "B"])` matches either name while `project("A").project("B")`
 * requires both. {@link TodoQuery.projects} and {@link TodoQuery.contexts}
 * are terminal plucks that resolve to unique, alphabetically sorted names;
 * {@link TodoQuery.count} and {@link TodoQuery.first} are terminal shortcuts.
 */
export interface TodoQuery extends PromiseLike<TodoRecord[]> {
  /** Only records that are not completed. */
  pending: () => TodoQuery;
  /** Only records that are completed. */
  completed: () => TodoQuery;
  /**
   * Only records tagged with the project `name`.
   *
   * An array matches any listed name (OR); repeated calls require every name
   * (AND). An empty array matches nothing. Matching is exact and
   * case-sensitive unless the client-level `caseSensitive` option or the
   * per-call override says otherwise; case-insensitive comparison uses
   * `toLowerCase()`, which is not full Unicode case folding.
   */
  project: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Only records tagged with the context `name`; see {@link TodoQuery.project}. */
  context: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /**
   * Only records not tagged with the project `name`.
   *
   * An array excludes every listed name; an empty array excludes nothing.
   * This is not a replacement for `pending()`/`completed()`.
   */
  notProject: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /** Only records not tagged with the context `name`; see {@link TodoQuery.notProject}. */
  notContext: (name: string | string[], options?: TodoMatchOptions) => TodoQuery;
  /**
   * Only records with priority `letter`.
   *
   * Matching is exact against the uppercase letter the parser stores, so
   * `priority("a")` matches nothing. An array matches any listed letter.
   */
  priority: (letter: string | string[]) => TodoQuery;
  /**
   * Only records whose description contains `text` as a substring.
   *
   * Case-insensitive by default, independently of the client-level matching
   * option. Only `description` is searched; projects, contexts, and metadata
   * have their own filters.
   */
  search: (text: string, options?: TodoMatchOptions) => TodoQuery;
  /**
   * Only records with the metadata `key`.
   *
   * With a `value`, the record's value must match it exactly.
   */
  meta: (key: string, value?: string) => TodoQuery;
  /** Only records that have the metadata `key`, whatever its value. */
  hasMeta: (key: string) => TodoQuery;
  /**
   * Only records created strictly after `date`.
   *
   * The argument must be a real calendar date in `YYYY-MM-DD` form; anything
   * else throws a `TypeError` when the query is built, before any IO.
   * Records without a creation date never match.
   */
  createdAfter: (date: string) => TodoQuery;
  /** Only records created strictly before `date`; see {@link TodoQuery.createdAfter}. */
  createdBefore: (date: string) => TodoQuery;
  /** Only records completed strictly after `date`; see {@link TodoQuery.createdAfter}. */
  completedAfter: (date: string) => TodoQuery;
  /** Only records completed strictly before `date`; see {@link TodoQuery.createdAfter}. */
  completedBefore: (date: string) => TodoQuery;
  /**
   * Sort the filtered records by `field`; default direction is `"asc"`.
   *
   * The sort is stable: records with equal keys keep file order. Missing
   * values (`null` priorities or dates, and missing or invalid `due` values)
   * sort last in both directions; `"desc"` reverses only the value
   * comparison, never the missing-value placement. Calling `sortBy` twice
   * keeps only the last call. Description ordering uses `localeCompare`, so
   * it follows the host locale for equal-ignoring-case ties.
   */
  sortBy: (field: TodoSortField, direction?: TodoSortDirection) => TodoQuery;
  /** Unique project names in the current result, alphabetically sorted. */
  projects: () => Promise<string[]>;
  /** Unique context names in the current result, alphabetically sorted. */
  contexts: () => Promise<string[]>;
  /** Number of records in the current result; equal to `(await query).length`. */
  count: () => Promise<number>;
  /**
   * The first record of the filtered (and sorted) result, or `undefined`
   * when nothing matches. The record is a copy, so mutating it cannot affect
   * the client's cache.
   */
  first: () => Promise<TodoRecord | undefined>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Build a name-matching predicate for projects or contexts.
 *
 * Case-insensitive comparison normalizes both sides with `toLowerCase()`,
 * which is deterministic across machines and locales but not full Unicode
 * case folding. `invert` turns the predicate into a negation filter.
 */
function nameFilter(
  pick: (todo: TodoRecord) => string[],
  names: string[],
  caseSensitive: boolean,
  invert: boolean,
): TodoFilter {
  const wanted = caseSensitive
    ? names
    : names.map((name) => name.toLowerCase());

  const matches = (todo: TodoRecord): boolean =>
    pick(todo).some((value) =>
      wanted.includes(caseSensitive ? value : value.toLowerCase()),
    );

  return invert ? (todo) => !matches(todo) : matches;
}

/**
 * Validate a date-filter argument at query-build time.
 *
 * Invalid arguments throw instead of silently matching nothing, so a typo in
 * a bound cannot hide behind an empty result.
 */
function requireValidDate(date: string, method: string): string {
  if (!isValidDate(date)) {
    throw new TypeError(
      `${method}() expected a real calendar date in YYYY-MM-DD form, got "${date}".`,
    );
  }

  return date;
}

/**
 * Build a date-comparison predicate on a record date field.
 *
 * Records with `null` dates never match; validated `YYYY-MM-DD` values
 * compare correctly as plain strings.
 */
function dateFilter(
  field: "createdAt" | "completedAt",
  date: string,
  method: string,
  keep: (recordDate: string, bound: string) => boolean,
): TodoFilter {
  const bound = requireValidDate(date, method);

  return (todo) => {
    const recordDate = todo[field];
    return recordDate !== null && keep(recordDate, bound);
  };
}

/** Read `data.due` when it is a real calendar date; otherwise `null`. */
function dueDateOf(todo: TodoRecord): string | null {
  const due = todo.data["due"];
  return due !== undefined && isValidDate(due) ? due : null;
}

type NullableSortField = Exclude<TodoSortField, "description">;

/** Extract the nullable sort key for every field except `description`. */
function sortKey(todo: TodoRecord, field: NullableSortField): string | null {
  switch (field) {
    case "priority":
      return todo.priority;
    case "createdAt":
      return todo.createdAt;
    case "completedAt":
      return todo.completedAt;
    case "due":
      return dueDateOf(todo);
  }
}

/**
 * Compare nullable keys with missing values last in both directions.
 *
 * `desc` negates only the value comparison, never the missing-value
 * placement; equal keys compare as `0` so the stable sort keeps file order.
 */
function compareNullableKeys(
  a: string | null,
  b: string | null,
  direction: TodoSortDirection,
): number {
  if (a === null) {
    return b === null ? 0 : 1;
  }

  if (b === null) {
    return -1;
  }

  const result = a < b ? -1 : a > b ? 1 : 0;
  return direction === "asc" ? result : -result;
}

/** Build the sort comparator for one ordering step. */
function makeComparator(
  spec: TodoSortSpec,
): (a: TodoRecord, b: TodoRecord) => number {
  if (spec.field === "description") {
    return (a, b) => {
      const result = a.description.localeCompare(b.description);
      return spec.direction === "asc" ? result : -result;
    };
  }

  const field: NullableSortField = spec.field;

  return (a, b) =>
    compareNullableKeys(
      sortKey(a, field),
      sortKey(b, field),
      spec.direction,
    );
}

/**
 * Sort in place and return the same array.
 *
 * `Array#sort` is stable, so records with equal keys keep file order.
 */
function applySort(records: TodoRecord[], sort: TodoSortSpec): TodoRecord[] {
  return records.sort(makeComparator(sort));
}

/**
 * Load, filter, and sort records without cloning them.
 *
 * The returned array is safe to sort because it is always a fresh copy when
 * a sort step exists; without one the loader's own array is returned as-is.
 */
async function resolveRaw(
  load: LoadRecords,
  state: TodoQueryState,
): Promise<TodoRecord[]> {
  const records = await load();

  if (state.sort === undefined) {
    if (state.filters.length === 0) {
      return records;
    }

    return records.filter((record) =>
      state.filters.every((filter) => filter(record)),
    );
  }

  // Never sort the loader's array in place: the client's cache must keep
  // file order for later queries.
  const matches =
    state.filters.length === 0
      ? records.slice()
      : records.filter((record) =>
          state.filters.every((filter) => filter(record)),
        );

  return applySort(matches, state.sort);
}

async function resolveRecords(
  load: LoadRecords,
  state: TodoQueryState,
): Promise<TodoRecord[]> {
  return cloneRecords(await resolveRaw(load, state));
}

function pluckNames(
  load: LoadRecords,
  state: TodoQueryState,
  pick: (todo: TodoRecord) => string[],
): Promise<string[]> {
  // Sorting never applies to name plucks; they alphabetize themselves.
  return resolveRaw(load, { ...state, sort: undefined }).then((records) =>
    uniqueSorted(records.flatMap(pick)),
  );
}

function resolveCount(
  load: LoadRecords,
  state: TodoQueryState,
): Promise<number> {
  return resolveRaw(load, { ...state, sort: undefined }).then(
    (records) => records.length,
  );
}

async function resolveFirst(
  load: LoadRecords,
  state: TodoQueryState,
): Promise<TodoRecord | undefined> {
  const first = (await resolveRaw(load, state))[0];
  return first === undefined ? undefined : cloneRecord(first);
}

/**
 * Create a lazy query over the records loaded by `load`.
 *
 * Each filter method appends a predicate, so chained calls compose with AND,
 * while array arguments match any listed value. `sortBy` appends an ordering
 * step instead of a predicate; the last `sortBy` call wins. For example,
 * `pending().completed()` matches nothing, while
 * `project("Work").pending()` matches pending records in `Work`, and
 * `pending().sortBy("priority")` lists them A first.
 */
export function createTodoQuery(
  load: LoadRecords,
  state: TodoQueryState = { filters: [], caseSensitive: true },
): TodoQuery {
  const nameOptions = (options?: TodoMatchOptions): boolean =>
    options?.caseSensitive ?? state.caseSensitive;

  return {
    pending: () =>
      createTodoQuery(load, {
        ...state,
        filters: [...state.filters, (todo) => !todo.completed],
      }),
    completed: () =>
      createTodoQuery(load, {
        ...state,
        filters: [...state.filters, (todo) => todo.completed],
      }),
    project: (name, options) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          nameFilter(
            (todo) => todo.projects,
            toArray(name),
            nameOptions(options),
            false,
          ),
        ],
      }),
    context: (name, options) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          nameFilter(
            (todo) => todo.contexts,
            toArray(name),
            nameOptions(options),
            false,
          ),
        ],
      }),
    notProject: (name, options) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          nameFilter(
            (todo) => todo.projects,
            toArray(name),
            nameOptions(options),
            true,
          ),
        ],
      }),
    notContext: (name, options) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          nameFilter(
            (todo) => todo.contexts,
            toArray(name),
            nameOptions(options),
            true,
          ),
        ],
      }),
    priority: (letter) => {
      const letters = toArray(letter);

      return createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          (todo) => todo.priority !== null && letters.includes(todo.priority),
        ],
      });
    },
    search: (text, options) => {
      const caseSensitive = options?.caseSensitive ?? false;
      const needle = caseSensitive ? text : text.toLowerCase();

      return createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          (todo) => {
            const haystack = caseSensitive
              ? todo.description
              : todo.description.toLowerCase();
            return haystack.includes(needle);
          },
        ],
      });
    },
    meta: (key, value) => {
      const filter: TodoFilter =
        value === undefined
          ? (todo) => Object.hasOwn(todo.data, key)
          : (todo) => todo.data[key] === value;

      return createTodoQuery(load, { ...state, filters: [...state.filters, filter] });
    },
    hasMeta: (key) =>
      createTodoQuery(load, {
        ...state,
        filters: [...state.filters, (todo) => Object.hasOwn(todo.data, key)],
      }),
    createdAfter: (date) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          dateFilter("createdAt", date, "createdAfter", (a, b) => a > b),
        ],
      }),
    createdBefore: (date) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          dateFilter("createdAt", date, "createdBefore", (a, b) => a < b),
        ],
      }),
    completedAfter: (date) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          dateFilter("completedAt", date, "completedAfter", (a, b) => a > b),
        ],
      }),
    completedBefore: (date) =>
      createTodoQuery(load, {
        ...state,
        filters: [
          ...state.filters,
          dateFilter("completedAt", date, "completedBefore", (a, b) => a < b),
        ],
      }),
    sortBy: (field, direction = "asc") =>
      createTodoQuery(load, { ...state, sort: { field, direction } }),
    projects: () => pluckNames(load, state, (todo) => todo.projects),
    contexts: () => pluckNames(load, state, (todo) => todo.contexts),
    count: () => resolveCount(load, state),
    first: () => resolveFirst(load, state),
    then: (onfulfilled, onrejected) =>
      resolveRecords(load, state).then(onfulfilled, onrejected),
  };
}
