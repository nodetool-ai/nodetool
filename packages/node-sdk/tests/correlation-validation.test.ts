import { describe, it, expect } from "vitest";
import { validateOutputCorrelation } from "../src/correlation-validation.js";

describe("validateOutputCorrelation", () => {
  it("returns no issues for valid metadata", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "buffered",
      {
        output: { kind: "single", source: "__execution__" }
      },
      ["output"]
    );
    expect(issues).toEqual([]);
  });

  it("returns no issues when output_correlation is undefined", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "buffered",
      undefined,
      ["output"]
    );
    expect(issues).toEqual([]);
  });

  it("rejects outputs missing a source", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "buffered",
      // @ts-expect-error: deliberately missing source
      { output: { kind: "single" } },
      ["output"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].handle).toBe("output");
    expect(issues[0].message).toMatch(/explicit source/);
  });

  it("rejects forward outputs that use __execution__ as source", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "buffered",
      {
        output: { kind: "forward", source: "__execution__" }
      },
      ["output"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/forward output .* cannot use source "__execution__"/);
  });

  it("rejects aggregate outputs without collapse", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "stream",
      {
        output: { kind: "aggregate", source: "input_item" }
      },
      ["output"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/aggregate output .* must declare a collapse spec/);
  });

  it("rejects aggregate outputs on buffered nodes", () => {
    const issues = validateOutputCorrelation(
      "test.Node",
      "buffered",
      {
        output: {
          kind: "aggregate",
          source: "input_item",
          collapse: "innermost"
        }
      },
      ["output"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/aggregate output .* is not allowed on buffered nodes/);
  });

  it("allows aggregate outputs on stream nodes", () => {
    const issues = validateOutputCorrelation(
      "test.Aggregator",
      "stream",
      {
        output: {
          kind: "aggregate",
          source: "input_item",
          collapse: "innermost"
        }
      },
      ["output"]
    );
    expect(issues).toEqual([]);
  });

  it("rejects iteration groups with conflicting sources", () => {
    const issues = validateOutputCorrelation(
      "test.Bad",
      "buffered",
      {
        output: { kind: "iteration", source: "list_a", group: "items" },
        index: { kind: "iteration", source: "list_b", group: "items" }
      },
      ["output", "index"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/iteration group "items" has conflicting sources/);
  });

  it("allows iteration siblings in one group with the same source", () => {
    const issues = validateOutputCorrelation(
      "test.ForEach",
      "buffered",
      {
        output: { kind: "iteration", source: "__execution__", group: "items" },
        index: { kind: "iteration", source: "__execution__", group: "items" }
      },
      ["output", "index"]
    );
    expect(issues).toEqual([]);
  });

  it("rejects references to handles not declared on the node", () => {
    const issues = validateOutputCorrelation(
      "test.Mismatch",
      "buffered",
      {
        ghost: { kind: "single", source: "__execution__" }
      },
      ["output"]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/not in declared outputs/);
  });

  it("skips the declared-outputs check when the declared list is empty", () => {
    // Dynamic-output nodes (supportsDynamicOutputs) may declare correlation
    // for handles not in the static output set.
    const issues = validateOutputCorrelation(
      "test.Dynamic",
      "buffered",
      {
        output: { kind: "single", source: "__execution__" }
      },
      []
    );
    expect(issues).toEqual([]);
  });

  it("collects multiple issues at once", () => {
    const issues = validateOutputCorrelation(
      "test.Multi",
      "buffered",
      {
        a: { kind: "forward", source: "__execution__" },
        b: { kind: "aggregate", source: "input" }
      },
      ["a", "b"]
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.some((i) => i.handle === "a")).toBe(true);
    expect(issues.some((i) => i.handle === "b")).toBe(true);
  });
});
