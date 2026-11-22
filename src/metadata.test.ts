import { describe, expect, test } from "bun:test";
import {
  isMetadataToken,
  parseMetadata,
  parseText,
  stripMetadata,
} from "./metadata.ts";
import type { ParseWarning } from "./types.ts";

describe("isMetadataToken", () => {
  test("recognizes projects, contexts, and extensions", () => {
    expect(isMetadataToken("+Family")).toBe(true);
    expect(isMetadataToken("@phone")).toBe(true);
    expect(isMetadataToken("due:2011-03-05")).toBe(true);
    expect(isMetadataToken("foo:bar:baz")).toBe(true);
    expect(isMetadataToken("url:https://example.com")).toBe(true);
    expect(isMetadataToken("due:")).toBe(true);
  });

  test("does not recognize bare markers or empty keys", () => {
    expect(isMetadataToken("+")).toBe(false);
    expect(isMetadataToken("@")).toBe(false);
    expect(isMetadataToken(":value")).toBe(false);
  });

  test("does not recognize emails or arithmetic as metadata", () => {
    expect(isMetadataToken("soandso@example.com")).toBe(false);
    expect(isMetadataToken("2+2")).toBe(false);
  });

  test("does not recognize the reserved __proto__ key as metadata", () => {
    expect(isMetadataToken("__proto__:polluted")).toBe(false);
    expect(isMetadataToken("__proto__:")).toBe(false);
  });
});

describe("parseMetadata", () => {
  test("collects projects, contexts, and data", () => {
    expect(parseMetadata("Call +Family @phone due:2011-03-05")).toEqual({
      projects: ["Family"],
      contexts: ["phone"],
      data: { due: "2011-03-05" },
    });
  });

  test("returns empty collections when there is no metadata", () => {
    expect(parseMetadata("Call Mom")).toEqual({
      projects: [],
      contexts: [],
      data: {},
    });
  });
});

describe("parseText warnings", () => {
  test("reports duplicate keys while keeping the last value", () => {
    const warnings: ParseWarning[] = [];
    const text = parseText("Task due:2010-01-02 due:2010-02-02", (warning) => {
      warnings.push(warning);
    });

    expect(text.data).toEqual({ due: "2010-02-02" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta).toEqual({
      key: "due",
      previousValue: "2010-01-02",
      value: "2010-02-02",
    });
  });

  test("does not treat inherited property names as duplicates", () => {
    const warnings: ParseWarning[] = [];
    parseText("Task constructor:first toString:second", (warning) => {
      warnings.push(warning);
    });

    expect(warnings).toEqual([]);
  });
});

describe("parseText reserved keys", () => {
  test("keeps a __proto__ token in the description and warns", () => {
    const warnings: ParseWarning[] = [];
    const text = parseText("task __proto__:polluted", (warning) => {
      warnings.push(warning);
    });

    expect(text.description).toBe("task __proto__:polluted");
    expect(text.data).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "reserved-key",
      message:
        'Reserved metadata key "__proto__"; the token stays in the description.',
      meta: { key: "__proto__", value: "polluted" },
    });
  });

  test("warns once per __proto__ token, never as a duplicate key", () => {
    const warnings: ParseWarning[] = [];
    const text = parseText("a __proto__:x __proto__:y", (warning) => {
      warnings.push(warning);
    });

    expect(text.description).toBe("a __proto__:x __proto__:y");
    expect(text.data).toEqual({});
    expect(warnings).toHaveLength(2);
    expect(warnings.every((warning) => warning.code === "reserved-key")).toBe(
      true,
    );
  });

  test("keeps an empty-valued __proto__ token", () => {
    const warnings: ParseWarning[] = [];
    const text = parseText("task __proto__:", (warning) => {
      warnings.push(warning);
    });

    expect(text.description).toBe("task __proto__:");
    expect(text.data).toEqual({});
    expect(warnings[0]?.meta).toEqual({ key: "__proto__", value: "" });
  });

  test("treats other spellings of proto as ordinary metadata", () => {
    const warnings: ParseWarning[] = [];
    const text = parseText("task __PROTO__:x proto:y", (warning) => {
      warnings.push(warning);
    });

    expect(text.description).toBe("task");
    expect(text.data).toEqual({ __PROTO__: "x", proto: "y" });
    expect(warnings).toEqual([]);
  });
});

describe("stripMetadata", () => {
  test("removes projects, contexts, and extensions", () => {
    expect(
      stripMetadata("Document +TodoTxt task format due:2011-03-05 @home"),
    ).toBe("Document task format");
  });

  test("normalizes whitespace left behind by removed tokens", () => {
    expect(stripMetadata("  Call   Mom   +Family  ")).toBe("Call Mom");
  });

  test("keeps non-metadata tokens", () => {
    expect(stripMetadata("Email soandso@example.com about 2+2")).toBe(
      "Email soandso@example.com about 2+2",
    );
  });

  test("keeps reserved-key tokens as description text", () => {
    expect(stripMetadata("task __proto__:polluted")).toBe(
      "task __proto__:polluted",
    );
  });

  test("returns an empty string when everything is metadata", () => {
    expect(stripMetadata("+Family @phone due:2011-03-05")).toBe("");
    expect(stripMetadata("")).toBe("");
  });
});
