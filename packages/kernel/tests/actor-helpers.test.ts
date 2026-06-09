/**
 * Unit tests for the pure key/bucket helpers in actor.ts.
 */
import { describe, it, expect } from "vitest";
import {
  trimKey,
  enumerateCandidateKeysForParent,
  enumerateAllPendingKeys
} from "../src/actor.js";

describe("trimKey", () => {
  it("returns the empty key for a zero prefix length", () => {
    expect(trimKey("a=1,b=2", 0)).toBe("");
  });

  it("returns the empty key for an empty key", () => {
    expect(trimKey("", 2)).toBe("");
  });

  it("returns the full key when it has no more parts than the prefix", () => {
    expect(trimKey("a=1", 1)).toBe("a=1");
    expect(trimKey("a=1,b=2", 2)).toBe("a=1,b=2");
  });

  it("trims to the first prefixLength parts", () => {
    expect(trimKey("a=1,b=2,c=3", 1)).toBe("a=1");
    expect(trimKey("a=1,b=2,c=3", 2)).toBe("a=1,b=2");
  });
});

describe("enumerateAllPendingKeys", () => {
  it("returns the deduplicated union of all bucket keys", () => {
    const maxBuckets = new Map<string, Map<string, unknown[]>>([
      ["h1", new Map([["a=1", [1]], ["a=2", [2]]])],
      ["h2", new Map([["a=1", [3]], ["a=3", [4]]])]
    ]);
    expect(enumerateAllPendingKeys(maxBuckets).sort()).toEqual([
      "a=1",
      "a=2",
      "a=3"
    ]);
  });
});

describe("enumerateCandidateKeysForParent", () => {
  it("returns deduplicated keys whose trimmed parent matches", () => {
    const maxBuckets = new Map<string, Map<string, unknown[]>>([
      ["h1", new Map([["a=1,b=1", [1]], ["a=2,b=1", [2]]])],
      ["h2", new Map([["a=1,b=2", [3]], ["a=1,b=1", [4]]])]
    ]);
    // parent scope length 1, parentKey "a=1" -> keys whose first part is a=1
    const out = enumerateCandidateKeysForParent(
      maxBuckets,
      [],
      new Map(),
      new Map(),
      2,
      "a=1",
      1
    );
    expect(out.sort()).toEqual(["a=1,b=1", "a=1,b=2"]);
  });

  it("returns nothing when no key's parent matches", () => {
    const maxBuckets = new Map<string, Map<string, unknown[]>>([
      ["h1", new Map([["a=2,b=1", [1]]])]
    ]);
    expect(
      enumerateCandidateKeysForParent(maxBuckets, [], new Map(), new Map(), 2, "a=1", 1)
    ).toEqual([]);
  });
});
