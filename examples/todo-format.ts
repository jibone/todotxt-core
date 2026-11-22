import {
  formatDocument,
  formatRecord,
  parseDocument,
  parseLine,
} from "../index.ts";
import { section } from "./print.ts";

section("formatRecord - canonical order");
const record = parseLine(
  "(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05",
);
console.log(`  ${formatRecord(record)}`);

section("formatRecord - tag order is normalized");
const shuffled = parseLine("Sort +b +a @z @y z:1 a:2");
console.log(`  source:    "Sort +b +a @z @y z:1 a:2"`);
console.log(`  formatted: ${formatRecord(shuffled)}`);

section("formatRecord - options drop tag groups");
const chores = parseLine("(A) Chores +Home @weekend due:2011-03-05");
console.log(`  all:           ${formatRecord(chores)}`);
console.log(`  no projects:   ${formatRecord(chores, { includeProjects: false })}`);
console.log(`  no contexts:   ${formatRecord(chores, { includeContexts: false })}`);
console.log(`  no metadata:   ${formatRecord(chores, { includeMetadata: false })}`);

section("formatRecord - canonical even when raw is present");
const sourced = parseLine("Task   due:1 due:2", { includeSource: true });
console.log(`  raw:       ${JSON.stringify(sourced.raw)}`);
console.log(`  formatted: ${formatRecord(sourced)}`);
console.log(`  idiom:      ${JSON.stringify(sourced.raw ?? formatRecord(sourced))}`);

section("formatDocument - whole files");
const todoFile = new URL("./todo.txt", import.meta.url);
const records = parseDocument(await Bun.file(todoFile).text());
const formatted = formatDocument(records);
console.log(`  records: ${records.length}`);
console.log(`  ends with a trailing newline: ${formatted.endsWith("\n")}`);

const crlf = formatDocument(records, { eol: "\r\n" });
console.log(`  CRLF version uses "\\r\\n": ${crlf.includes("\r\n")}`);

section("formatDocument - reparse round-trip");
const reparsed = parseDocument(formatted);
console.log(
  `  records parse back identical: ${JSON.stringify(reparsed) === JSON.stringify(records)}`,
);
console.log(`  (multi-tag records normalize their tag order, so they may differ)`);
console.log(
  `  canonical output is stable: ${formatDocument(reparsed) === formatted}`,
);
console.log(
  `  reparsed records are stable: ${JSON.stringify(parseDocument(formatDocument(reparsed))) === JSON.stringify(reparsed)}`,
);
