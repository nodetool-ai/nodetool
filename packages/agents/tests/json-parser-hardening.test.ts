/**
 * Mutation-hardening tests for extractJSON. Each pins one externally-meaningful
 * property of the balanced-brace scanner that ordinary coverage left unverified.
 */
import { describe, it, expect } from "vitest";
import { extractJSON } from "../src/utils/json-parser.js";

describe("extractJSON — mutation hardening", () => {
  // A fenced *primitive* can only be recovered through the fence path; strategy 3
  // finds no braces/brackets. Kills the fence conditional / try-block mutants.
  it("parses a primitive inside a fenced block (only the fence path can)", () => {
    expect(extractJSON("```json\n42\n```")).toBe(42);
  });

  // A `}` inside a string value must NOT close the object. Forcing strategy 3
  // (direct parse fails on the surrounding prose) exercises the inString machine.
  it("respects a closing brace inside a string when scanning embedded JSON", () => {
    expect(extractJSON('prefix {"a":"}"} suffix')).toEqual({ a: "}" });
  });

  // An escaped quote must not end the string, or the following `}` would be read
  // as the object close. Kills the escape-handling mutants.
  it("respects an escaped quote before a brace when scanning embedded JSON", () => {
    expect(extractJSON('prefix {"a":"\\"}"} suffix')).toEqual({ a: '"}' });
  });
});
