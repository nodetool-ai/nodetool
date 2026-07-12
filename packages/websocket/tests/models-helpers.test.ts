/**
 * Regression tests for two security-sensitive helpers in the models router:
 *
 *  - matchesPattern: a linear glob matcher that replaced a client-controlled
 *    `*` -> `.*` regex vulnerable to catastrophic backtracking (ReDoS, #12).
 *  - safeJoinWithin: rejects client file paths that escape the HuggingFace
 *    snapshot dir, closing a path-traversal existence oracle (#10).
 */

import { describe, it, expect } from "vitest";
import { join, resolve, sep } from "node:path";
import { matchesPattern, safeJoinWithin } from "../src/trpc/routers/models.js";

describe("matchesPattern (glob, ReDoS-safe)", () => {
  it("matches literal and wildcard patterns like the previous regex", () => {
    expect(matchesPattern("model.safetensors", "*.safetensors")).toBe(true);
    expect(matchesPattern("model.bin", "*.safetensors")).toBe(false);
    expect(matchesPattern("a/b/c.json", "a/*/c.json")).toBe(true);
    expect(matchesPattern("abc", "a?c")).toBe(true);
    expect(matchesPattern("ac", "a?c")).toBe(false);
    expect(matchesPattern("anything", "*")).toBe(true);
    expect(matchesPattern("", "*")).toBe(true);
    expect(matchesPattern("exact", "exact")).toBe(true);
    expect(matchesPattern("exact", "other")).toBe(false);
    expect(matchesPattern("aXbXc", "a*b*c")).toBe(true);
  });

  it("returns quickly on a catastrophic-backtracking pattern (no ReDoS)", () => {
    // The classic evil pattern: many `*a` groups followed by a token the input
    // never contains. A backtracking regex would hang here; the linear matcher
    // must resolve it near-instantly.
    const evil = "*a".repeat(30) + "Z";
    const input = "a".repeat(60); // no trailing Z → forces maximal backtracking
    const start = Date.now();
    expect(matchesPattern(input, evil)).toBe(false);
    expect(Date.now() - start).toBeLessThan(100);
  });
});

describe("safeJoinWithin (path-traversal guard)", () => {
  const base = resolve("/tmp/hf/snapshots/abc");

  it("returns a contained path for normal relative inputs", () => {
    expect(safeJoinWithin(base, "model.safetensors")).toBe(
      join(base, "model.safetensors")
    );
    expect(safeJoinWithin(base, "sub/dir/file.bin")).toBe(
      join(base, "sub", "dir", "file.bin")
    );
  });

  it("rejects `..` traversal that escapes the base dir", () => {
    expect(safeJoinWithin(base, "../../../../etc/passwd")).toBeNull();
    expect(safeJoinWithin(base, "../abc-sibling/secret")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(safeJoinWithin(base, "/etc/passwd")).toBeNull();
  });

  it("allows `..` segments that stay within the base dir", () => {
    const contained = safeJoinWithin(base, "sub/../model.bin");
    expect(contained).toBe(join(base, "model.bin"));
    expect(contained!.startsWith(base + sep)).toBe(true);
  });
});
