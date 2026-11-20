import {
  createTodoTxt,
  parseDocumentResult,
  TodoReadError,
} from "../index.ts";
import type { ParseResult } from "../index.ts";
import { section } from "./print.ts";

const contents = [
  "(A) Thank Mom for the meatballs @phone",
  "",
  // 2011-99-99 is not a real calendar date, so it stays in the description.
  "x 2011-99-99 Fix the time machine +Chores",
  // The second `due:` wins; the duplicate is reported.
  "Post signs due:2024-04-01 due:2024-05-01 +GarageSale",
].join("\n");

section("parseDocumentResult() - records, warnings, and line counts as data");
const result: ParseResult = parseDocumentResult(contents);
console.log(`  records:      ${result.records.length}`);
console.log(`  lineCount:    ${result.lineCount}`);
console.log(`  skippedLines: ${result.skippedLines}`);

if (result.warnings.length === 0) {
  console.log("  warnings:     (none)");
} else {
  for (const warning of result.warnings) {
    console.log(`  line ${warning.line}: [${warning.code}] ${warning.message}`);
  }
}

section("client.warnings() - the latest read's warnings, as data");
let readCount = 0;
const todos = createTodoTxt({
  read: () => {
    readCount += 1;
    // The first read has a duplicate `due:` key; the refresh below is clean.
    return readCount === 1
      ? "Renew passport due:2024-01-01 due:2024-06-01"
      : "Renew passport due:2024-06-01";
  },
});

await todos.all();
console.log(`  first read: ${todos.warnings().length} warning(s)`);
for (const warning of todos.warnings()) {
  console.log(`  line ${warning.line}: [${warning.code}] ${warning.message}`);
}

await todos.all();
console.log(`  clean read: ${todos.warnings().length} warning(s)`);

section("TodoReadError - a non-Error read failure is typed");
const broken = createTodoTxt({
  // A read hook should reject with an Error; anything else gets wrapped.
  read: () => Promise.reject("todo.txt went missing"),
});

try {
  await broken.all();
} catch (error) {
  if (error instanceof TodoReadError) {
    console.log(`  name:  ${error.name}`);
    console.log(`  cause: ${String(error.cause)}`);
  }
}
