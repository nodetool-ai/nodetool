import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_ITERATIONS,
  MAX_ITERATIONS_LIMIT,
  resolveMaxIterations
} from "../../src/loop.js";

describe("resolveMaxIterations", () => {
  it.each<[string, unknown, number]>([
    ["undefined", undefined, DEFAULT_MAX_ITERATIONS],
    ["null", null, DEFAULT_MAX_ITERATIONS],
    ["non-numeric string", "abc", DEFAULT_MAX_ITERATIONS],
    ["NaN", NaN, DEFAULT_MAX_ITERATIONS],
    ["empty string", "", 1],
    ["zero", 0, 1],
    ["negative", -5, 1],
    ["fraction below one", 0.5, 1],
    ["fraction floors", 2.9, 2],
    ["numeric string", "7", 7],
    ["in range", 50, 50],
    ["limit", MAX_ITERATIONS_LIMIT, MAX_ITERATIONS_LIMIT],
    ["above limit", MAX_ITERATIONS_LIMIT + 1, MAX_ITERATIONS_LIMIT],
    ["Infinity clamps to the limit", Infinity, MAX_ITERATIONS_LIMIT],
    ["overflowing number literal clamps to the limit", Number("1e999"), MAX_ITERATIONS_LIMIT],
    ["-Infinity clamps to one", -Infinity, 1]
  ])("%s", (_name, raw, expected) => {
    expect(resolveMaxIterations(raw)).toBe(expected);
  });
});
