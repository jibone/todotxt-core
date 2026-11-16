import type { TodoRecord } from "../index.ts";

export function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export function printRecords(records: TodoRecord[]): void {
  if (records.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const record of records) {
    const marker = record.completed ? "x" : " ";
    const priority = record.priority ? `(${record.priority}) ` : "";
    console.log(`  ${marker} ${priority}${record.description}`);
    console.log(`      projects: ${record.projects.join(", ") || "-"}`);
    console.log(`      contexts: ${record.contexts.join(", ") || "-"}`);
    console.log(`      data: ${JSON.stringify(record.data)}`);
  }
}

export function printNames(names: string[]): void {
  console.log(`  ${names.length === 0 ? "(none)" : names.join(", ")}`);
}
