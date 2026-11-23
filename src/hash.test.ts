import { describe, expect, test } from "bun:test";
import { fingerprint, sameFingerprint } from "./hash.ts";

const CORPUS = [
  "",
  "Task",
  "Task\n",
  "x 2011-03-03 Call Mom +Family @phone due:2011-03-05",
  "Rendez-vous au café",
  "価値\n",
  "(A) 2026-11-22 Chores +Home @weekend due:2026-12-01",
];

describe("fingerprint", () => {
  test("is deterministic for the same contents", () => {
    for (const contents of CORPUS) {
      expect(fingerprint(contents)).toEqual(fingerprint(contents));
    }
  });

  test("matches identical contents", () => {
    expect(sameFingerprint(fingerprint("Task\n"), fingerprint("Task\n"))).toBe(
      true,
    );
  });

  test("discriminates different contents", () => {
    const prints = CORPUS.map((contents) => fingerprint(contents));
    const unique = new Set(prints.map((print) => `${print.length}:${print.hash}`));

    expect(unique.size).toBe(CORPUS.length);
  });

  test("discriminates same-length contents", () => {
    expect(sameFingerprint(fingerprint("Call Mom"), fingerprint("Call Dad"))).toBe(false);
    expect(sameFingerprint(fingerprint("abc"), fingerprint("abd"))).toBe(false);
    expect(sameFingerprint(fingerprint("abc"), fingerprint("cba"))).toBe(false);
  });

  test("detects length differences by construction", () => {
    // The length is part of the fingerprint, so a size change can never
    // collide.
    expect(sameFingerprint(fingerprint("Task"), fingerprint("Tasks"))).toBe(
      false,
    );
    expect(sameFingerprint(fingerprint(""), fingerprint("\n"))).toBe(false);
  });

  test("discriminates single-character edits at every position", () => {
    const base = "x 2011-03-03 Call Mom +Family @phone due:2011-03-05";
    const basePrint = fingerprint(base);

    for (let index = 0; index < base.length; index += 1) {
      const mutated = `${base.slice(0, index)}#${base.slice(index + 1)}`;

      expect(sameFingerprint(basePrint, fingerprint(mutated))).toBe(false);
    }
  });

  test("records the length in UTF-16 code units", () => {
    expect(fingerprint("Task").length).toBe(4);
    expect(fingerprint("").length).toBe(0);
    expect(fingerprint("价值").length).toBe(2);
  });

  test("produces a non-negative safe integer", () => {
    for (const contents of CORPUS) {
      const { hash } = fingerprint(contents);

      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }
  });
});
