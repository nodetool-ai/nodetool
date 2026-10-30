/**
 * Tests for the shared numeric-flag parser (src/numeric-options.ts).
 *
 * The bug it exists to prevent: `Number("0,8")` is `NaN`, and `rate < NaN` is
 * false — a CI gate that silently stops gating. Every case here is a value a
 * user actually types.
 */
import { describe, expect, it } from "vitest";
import {
  numericOptionParser,
  parseNumericOption
} from "../src/numeric-options.js";
import { printCommandError } from "../src/command-errors.js";

describe("parseNumericOption", () => {
  it("parses plain numbers", () => {
    expect(parseNumericOption("0.8", "--min-success")).toBe(0.8);
    expect(parseNumericOption(" 12 ", "--timeout")).toBe(12);
  });

  it("rejects values that would become NaN", () => {
    for (const bad of ["0,8", "abc", "", "  ", "1.2.3"]) {
      expect(() => parseNumericOption(bad, "--min-success")).toThrow(
        /--min-success must be a number/
      );
    }
  });

  it("rejects infinities", () => {
    expect(() => parseNumericOption("Infinity", "--cost-cap")).toThrow(
      /--cost-cap/
    );
  });

  it("enforces integer, min and max", () => {
    expect(() =>
      parseNumericOption("1.5", "--max-retries", { integer: true })
    ).toThrow(/--max-retries must be an integer/);
    expect(() => parseNumericOption("-1", "--timeout", { min: 0 })).toThrow(
      /--timeout must be a number >= 0/
    );
    expect(() =>
      parseNumericOption("1.5", "--min-success", { min: 0, max: 1 })
    ).toThrow(/--min-success must be a number <= 1/);
  });

  it("names the flag in the message", () => {
    expect(() => parseNumericOption("x", "--cost-cap")).toThrow(
      '--cost-cap must be a number (got "x")'
    );
  });

  it("exposes a Commander argParser form", () => {
    const parse = numericOptionParser("--timeout", { integer: true, min: 0 });
    expect(parse("500")).toBe(500);
    expect(() => parse("soon")).toThrow(/--timeout/);
  });
});

describe("printCommandError", () => {
  it("writes the message to stderr and nothing to stdout by default", () => {
    const out: string[] = [];
    const err: string[] = [];
    const log = console.log;
    const error = console.error;
    console.log = (line: string) => out.push(line);
    console.error = (line: string) => err.push(line);
    try {
      printCommandError(new Error("boom"));
      printCommandError(new Error("boom"), true);
    } finally {
      console.log = log;
      console.error = error;
    }
    expect(err).toEqual(["boom", "boom"]);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual({ error: "boom" });
  });
});
