import { describe, expect, it } from "vitest";
import {
  isModelSelected,
  isModelSelection,
  UNSET_PROVIDER
} from "../src/model-selection.js";

describe("isModelSelection", () => {
  const cases: Array<[string, unknown, unknown, boolean]> = [
    ["real provider and id", "openai", "gpt-4", true],
    ["unset provider sentinel", UNSET_PROVIDER, "gpt-4", false],
    ["literal 'undefined' id", "openai", "undefined", false],
    ["missing provider", undefined, "gpt-4", false],
    ["null provider", null, "gpt-4", false],
    ["empty provider", "", "gpt-4", false],
    ["missing id", "openai", undefined, false],
    ["null id", "openai", null, false],
    ["empty id", "openai", "", false],
    ["both missing", undefined, undefined, false],
    ["non-string provider", 1, "gpt-4", false],
    ["non-string id", "openai", {}, false],
    ["sentinel is case-sensitive", "Empty", "gpt-4", true],
    ["'undefined' is only rejected as an id", "undefined", "gpt-4", true],
    ["the sentinel is a valid id", "openai", UNSET_PROVIDER, true]
  ];

  it.each(cases)("%s", (_name, provider, id, expected) => {
    expect(isModelSelection(provider, id)).toBe(expected);
  });
});

describe("isModelSelected", () => {
  it("rejects null and undefined models", () => {
    expect(isModelSelected(null)).toBe(false);
    expect(isModelSelected(undefined)).toBe(false);
  });

  it("agrees with isModelSelection on provider and id", () => {
    expect(isModelSelected({ provider: "openai", id: "gpt-4" })).toBe(true);
    expect(isModelSelected({ provider: UNSET_PROVIDER, id: "gpt-4" })).toBe(false);
    expect(isModelSelected({ provider: "openai" })).toBe(false);
    expect(isModelSelected({ provider: "openai", id: null })).toBe(false);
  });
});
