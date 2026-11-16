import { parseLine } from "../../index.ts";
import type { ParseWarning } from "../../index.ts";

/** Print the parsed record and any warnings for a single todo.txt line. */
export function show(line: string): void {
  const warnings: ParseWarning[] = [];
  const record = parseLine(line, (warning) => warnings.push(warning));

  console.log(`\n"${line}"`);
  console.log(JSON.stringify(record, null, 2));

  for (const warning of warnings) {
    console.log(`warning (${warning.code}): ${warning.message}`);
  }
}

/** Print a section heading. */
export function heading(title: string): void {
  console.log(`\n\n=== ${title} ===`);
}
