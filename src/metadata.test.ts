import { describe, expect, test } from "bun:test";
import { isMetadataToken, parseMetadata, stripMetadata } from "./metadata.ts";

describe("isMetadataToken", () => {
  test("recognizes projects, contexts, and extensions", () => {
    expect(isMetadataToken("+Family")).toBe(true);
    expect(isMetadataToken("@phone")).toBe(true);
    expect(isMetadataToken("due:2011-03-05")).toBe(true);
  });

  test("does not recognize bare markers or malformed extensions", () => {
    expect(isMetadataToken("+")).toBe(false);
    expect(isMetadataToken("@")).toBe(false);
    expect(isMetadataToken("foo:bar:baz")).toBe(false);
  });

  test("does not recognize emails or arithmetic as metadata", () => {
    expect(isMetadataToken("soandso@example.com")).toBe(false);
    expect(isMetadataToken("2+2")).toBe(false);
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

  test("returns an empty string when everything is metadata", () => {
    expect(stripMetadata("+Family @phone due:2011-03-05")).toBe("");
    expect(stripMetadata("")).toBe("");
  });
});
