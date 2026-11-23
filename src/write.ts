import type { TodoRecord } from "./types.ts";

/**
 * One physical line of a todo.txt document: its text and the terminator
 * that followed it in the source.
 *
 * Keeping the terminator per line lets writes splice a document without
 * disturbing the line endings of untouched lines, including files that mix
 * `\n` and `\r\n`.
 */
export interface DocumentLine {
  /** The line's text, without its terminator. */
  text: string;
  /**
   * The terminator that followed this line in the source, or `""` for a
   * final line that ended without one.
   */
  eol: "" | "\n" | "\r" | "\r\n";
}

/**
 * Split a todo.txt document into physical lines with their terminators.
 *
 * The result matches the parser's line numbering exactly: line `N` of
 * `parseDocument` is `lines[N - 1]`, blank lines included. The empty
 * document has no lines, and a single trailing terminator ends the last
 * line rather than starting an empty one.
 */
export function splitDocument(contents: string): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let start = 0;
  let index = 0;

  while (index < contents.length) {
    const character = contents.charAt(index);

    if (character !== "\r" && character !== "\n") {
      index += 1;
      continue;
    }

    const eol: DocumentLine["eol"] =
      character === "\r" && contents.charAt(index + 1) === "\n"
        ? "\r\n"
        : character;
    lines.push({ text: contents.slice(start, index), eol });
    index += eol.length;
    start = index;
  }

  if (start < contents.length) {
    lines.push({ text: contents.slice(start), eol: "" });
  }

  return lines;
}

/** Join physical lines back into a document, each with its own terminator. */
export function joinDocument(lines: readonly DocumentLine[]): string {
  let contents = "";

  for (const line of lines) {
    contents += `${line.text}${line.eol}`;
  }

  return contents;
}

/**
 * The document's line ending for a newly appended line: the last non-empty
 * terminator seen in the file, defaulting to `"\n"` for a document that ends
 * without any (or is empty).
 */
export function lastEol(lines: readonly DocumentLine[]): "\n" | "\r" | "\r\n" {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const eol = lines[index]?.eol;

    if (eol !== undefined && eol !== "") {
      return eol;
    }
  }

  return "\n";
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function dataEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}

/**
 * Field-by-field equality of two records' parsed contents.
 *
 * Source fields (`line`, `raw`) are ignored: two records are equal when the
 * todo they describe is equal. Project and context order counts, matching
 * how the records were reported. The write APIs use this to notice that a
 * record a consumer passed back no longer matches the file.
 */
export function recordsEqual(a: TodoRecord, b: TodoRecord): boolean {
  return (
    a.completed === b.completed &&
    a.priority === b.priority &&
    a.completedAt === b.completedAt &&
    a.createdAt === b.createdAt &&
    a.description === b.description &&
    arraysEqual(a.projects, b.projects) &&
    arraysEqual(a.contexts, b.contexts) &&
    dataEqual(a.data, b.data)
  );
}
