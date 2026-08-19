/**
 * Unit tests for the collection ownership/input rules. The router and REST
 * handler tests cover how these are applied; these cover the edges of the
 * helpers themselves.
 */
import { describe, it, expect } from "vitest";
import {
  OWNER_METADATA_KEY,
  canAccessCollection,
  collectionOwner,
  stripReservedMetadata,
  validateCollectionName,
  MAX_COLLECTION_NAME_LENGTH
} from "@nodetool-ai/vectorstore";

describe("collectionOwner", () => {
  it("reads the owner from metadata", () => {
    expect(collectionOwner({ [OWNER_METADATA_KEY]: "user-1" })).toBe("user-1");
  });

  it("treats missing, empty, and non-string owners as unowned", () => {
    expect(collectionOwner(undefined)).toBeNull();
    expect(collectionOwner({})).toBeNull();
    expect(collectionOwner({ [OWNER_METADATA_KEY]: "" })).toBeNull();
    expect(collectionOwner({ [OWNER_METADATA_KEY]: 42 })).toBeNull();
  });
});

describe("canAccessCollection", () => {
  it("grants the owner", () => {
    expect(
      canAccessCollection({ [OWNER_METADATA_KEY]: "user-1" }, "user-1")
    ).toBe(true);
  });

  it("denies a different user", () => {
    expect(
      canAccessCollection({ [OWNER_METADATA_KEY]: "user-2" }, "user-1")
    ).toBe(false);
  });

  it("shares unowned legacy collections", () => {
    expect(canAccessCollection({}, "user-1")).toBe(true);
    expect(canAccessCollection(undefined, "anyone")).toBe(true);
  });

  it("does not treat a numeric owner as a match for its string form", () => {
    expect(canAccessCollection({ [OWNER_METADATA_KEY]: 1 }, "1")).toBe(true);
  });
});

describe("stripReservedMetadata", () => {
  it("removes the owner key", () => {
    expect(
      stripReservedMetadata({ [OWNER_METADATA_KEY]: "user-2", a: "1" })
    ).toEqual({ a: "1" });
  });

  it("returns an empty object for undefined input", () => {
    expect(stripReservedMetadata(undefined)).toEqual({});
  });

  it("does not mutate the input", () => {
    const input = { [OWNER_METADATA_KEY]: "user-2", a: "1" };
    stripReservedMetadata(input);
    expect(input[OWNER_METADATA_KEY]).toBe("user-2");
  });

  it("keeps a __proto__ key as data instead of touching the prototype", () => {
    const input = JSON.parse('{"__proto__": "polluted", "a": "1"}') as Record<
      string,
      string
    >;
    const result = stripReservedMetadata(input);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.a).toBe("1");
  });
});

describe("validateCollectionName", () => {
  it("accepts ordinary names", () => {
    for (const name of ["docs", "my_docs", "my-docs", "My Docs", "docs.v2"]) {
      expect(validateCollectionName(name)).toBeNull();
    }
  });

  it("rejects an empty name", () => {
    expect(validateCollectionName("")).toContain("required");
  });

  it("rejects path separators", () => {
    // The REST index route matches `[^/]+`, so a name with a slash is
    // unreachable through that endpoint anyway.
    expect(validateCollectionName("a/b")).toContain("path separators");
    expect(validateCollectionName("a\\b")).toContain("path separators");
  });

  it("rejects control characters", () => {
    expect(validateCollectionName("a\nb")).toContain("control characters");
    expect(validateCollectionName("a\u0000b")).toContain("control characters");
    expect(validateCollectionName("a\u007fb")).toContain("control characters");
  });

  it("rejects surrounding whitespace", () => {
    expect(validateCollectionName(" docs")).toContain("whitespace");
    expect(validateCollectionName("docs ")).toContain("whitespace");
  });

  it("rejects a name past the length cap but accepts one at it", () => {
    expect(
      validateCollectionName("x".repeat(MAX_COLLECTION_NAME_LENGTH))
    ).toBeNull();
    expect(
      validateCollectionName("x".repeat(MAX_COLLECTION_NAME_LENGTH + 1))
    ).toContain("exceeds");
  });
});
