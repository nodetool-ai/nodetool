// @ts-nocheck
/**
 * Mutation-hardening tests for correlation-validation.ts: the
 * CorrelationMetadataError summary (single vs multiple), iteration-group
 * source-conflict detection, and the missing-correlation-entry rule.
 */
import { describe, it, expect } from "vitest";
import {
  CorrelationMetadataError,
  validateOutputCorrelation
} from "../src/correlation-validation.js";

describe("CorrelationMetadataError summary", () => {
  it("renders a single issue inline as 'nodeType: message'", () => {
    const err = new CorrelationMetadataError([
      { nodeType: "pkg.Node", message: "boom" }
    ]);
    expect(err.name).toBe("CorrelationMetadataError");
    expect(err.message).toBe("pkg.Node: boom");
    expect(err.issues).toHaveLength(1);
  });

  it("renders multiple issues as a counted, bulleted list with handles", () => {
    const err = new CorrelationMetadataError([
      { nodeType: "pkg.Node", handle: "a", message: "m1" },
      { nodeType: "pkg.Node", message: "m2" }
    ]);
    expect(err.message).toBe(
      "2 correlation metadata issues:\n  - pkg.Node.a: m1\n  - pkg.Node: m2"
    );
  });
});

describe("iteration group source conflicts", () => {
  it("flags two handles in one group with different sources", () => {
    const issues = validateOutputCorrelation(
      "pkg.Node",
      "stream",
      {
        x: { kind: "iteration", group: "g", source: "in1" },
        y: { kind: "iteration", group: "g", source: "in2" }
      },
      ["x", "y"]
    );
    expect(issues.some((i) => i.message.includes("conflicting sources"))).toBe(true);
  });

  it("accepts two handles in one group sharing a source", () => {
    const issues = validateOutputCorrelation(
      "pkg.Node",
      "stream",
      {
        x: { kind: "iteration", group: "g", source: "in1" },
        y: { kind: "iteration", group: "g", source: "in1" }
      },
      ["x", "y"]
    );
    expect(issues).toEqual([]);
  });
});

describe("declared-output coverage", () => {
  it("flags a declared output with no correlation entry", () => {
    const issues = validateOutputCorrelation(
      "pkg.Node",
      "stream",
      { a: { kind: "single", source: "__execution__" } },
      ["a", "b"]
    );
    expect(
      issues.some((i) => i.handle === "b" && i.message.includes("missing a correlation entry"))
    ).toBe(true);
  });

  it("does not run the declared-output check when no outputs are declared", () => {
    const issues = validateOutputCorrelation(
      "pkg.Node",
      "stream",
      { a: { kind: "single", source: "__execution__" } },
      []
    );
    expect(issues).toEqual([]);
  });
});
