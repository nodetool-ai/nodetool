/**
 * Tests for salvaging a JSON reply that was cut off at a token ceiling.
 *
 * Reproduction of the shipped failure: a vision judge on a reasoning model
 * spent its budget thinking and stopped mid-defect, so `critique_image`
 * reported "Judge did not return parseable JSON" and threw away a verdict plus
 * every defect the judge had already finished writing.
 */

import { describe, it, expect } from "vitest";
import {
  extractJSON,
  extractJSONAllowingTruncation,
  salvageTruncatedJSON
} from "../src/utils/json-parser.js";

const CUT_OFF = `\`\`\`json
{
  "verdict": "revise",
  "defects": [
    { "defect": "Airborne liquid", "location": "upper left", "fix": "remove the mist" },
    { "defect": "Malformed finger", "location": "index finger", "fix": "redraw the grip" },
    { "defect": "The athlete's fingernails are noticeably long and appear un`;

describe("salvageTruncatedJSON", () => {
  it("recovers the complete prefix of a reply cut off mid-value", () => {
    expect(extractJSON(CUT_OFF)).toBeNull();
    const salvaged = salvageTruncatedJSON(CUT_OFF) as {
      verdict: string;
      defects: { defect: string }[];
    };
    expect(salvaged.verdict).toBe("revise");
    expect(salvaged.defects.map((d) => d.defect)).toEqual([
      "Airborne liquid",
      "Malformed finger"
    ]);
  });

  it("drops a trailing key whose value never arrived", () => {
    const salvaged = salvageTruncatedJSON(
      '{"winner": 1, "reason": "sharper", "notes"'
    ) as { winner: number; reason: string };
    expect(salvaged).toEqual({ winner: 1, reason: "sharper" });
  });

  it("closes nested containers in the right order", () => {
    const salvaged = salvageTruncatedJSON(
      '{"a": {"b": [1, 2, {"c": "d"}, 3'
    ) as { a: { b: unknown[] } };
    expect(salvaged.a.b).toEqual([1, 2, { c: "d" }, 3]);
  });

  it("is not fooled by brackets and quotes inside a string", () => {
    const salvaged = salvageTruncatedJSON(
      '{"note": "a }] \\" trap", "next": "half'
    ) as { note: string };
    expect(salvaged).toEqual({ note: 'a }] " trap' });
  });

  it("returns null when the reply is not JSON at all", () => {
    expect(salvageTruncatedJSON("I'm sorry, I cannot help with that")).toBeNull();
    expect(salvageTruncatedJSON("")).toBeNull();
  });

  it("leaves a complete document to extractJSON, unchanged", () => {
    const whole = '{"verdict": "pass", "defects": []}';
    expect(extractJSONAllowingTruncation(whole)).toEqual({
      verdict: "pass",
      defects: []
    });
    // Salvaging one is a no-op rather than a second reading of it.
    expect(salvageTruncatedJSON(whole)).toEqual({
      verdict: "pass",
      defects: []
    });
  });

  it("gives up on an input too large to walk", () => {
    expect(salvageTruncatedJSON(`{"a": "${"x".repeat(300_000)}`)).toBeNull();
  });
});
