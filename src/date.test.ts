import { describe, expect, test } from "bun:test";
import { isValidDate } from "./date.ts";

describe("isValidDate", () => {
  test("accepts real calendar dates", () => {
    expect(isValidDate("2011-03-02")).toBe(true);
    expect(isValidDate("2000-01-01")).toBe(true);
    expect(isValidDate("9999-12-31")).toBe(true);
    expect(isValidDate("2011-04-30")).toBe(true);
  });

  test("rejects values that do not match the YYYY-MM-DD shape", () => {
    expect(isValidDate("2011-3-2")).toBe(false);
    expect(isValidDate("2011-03-2")).toBe(false);
    expect(isValidDate("11-03-02")).toBe(false);
    expect(isValidDate("2011/03/02")).toBe(false);
    expect(isValidDate("2011-03-02T00:00")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  test("rejects out-of-range months and days", () => {
    expect(isValidDate("2011-00-10")).toBe(false);
    expect(isValidDate("2011-13-10")).toBe(false);
    expect(isValidDate("2011-99-99")).toBe(false);
    expect(isValidDate("2011-01-00")).toBe(false);
    expect(isValidDate("2011-01-32")).toBe(false);
    expect(isValidDate("2011-04-31")).toBe(false);
    expect(isValidDate("2011-06-31")).toBe(false);
    expect(isValidDate("2011-02-30")).toBe(false);
  });

  test("applies leap year rules to February", () => {
    expect(isValidDate("2012-02-29")).toBe(true);
    expect(isValidDate("2000-02-29")).toBe(true);

    expect(isValidDate("2011-02-29")).toBe(false);
    expect(isValidDate("1900-02-29")).toBe(false);
  });
});
