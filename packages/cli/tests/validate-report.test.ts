import { describe, it, expect, vi } from "vitest";
import type { GraphValidationReport } from "@nodetool-ai/node-sdk";

// node-sdk is stubbed in this workspace's vitest config; the report renderer
// only needs its headline helper.
vi.mock("@nodetool-ai/node-sdk", () => ({
  validationHeadline: (report: GraphValidationReport) =>
    `${report.nodeCount} nodes, ${report.counts.errors} errors, ${report.counts.warnings} warnings`
}));

const { renderValidation } = await import("../src/commands/validate.js");

function report(
  issues: GraphValidationReport["issues"]
): GraphValidationReport {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  return {
    ok: errors === 0,
    nodeCount: 2,
    edgeCount: 1,
    counts: { errors, warnings, info },
    issues
  };
}

describe("renderValidation", () => {
  it("explains every code it printed", () => {
    const out = renderValidation(
      report([
        {
          severity: "info",
          code: "untyped_dynamic_slot",
          edgeId: "e1",
          nodeId: "tpl",
          message: "dynamic input has no declared type"
        },
        {
          severity: "warning",
          code: "dynamic_type_mismatch",
          nodeId: "tpl",
          message: "inline value does not match the slot type"
        }
      ])
    ).join("\n");

    expect(out).toContain("(untyped_dynamic_slot)");
    expect(out).toContain("(dynamic_type_mismatch)");
    expect(out).toContain("Codes:");
    expect(out).toMatch(/untyped_dynamic_slot — .*not type-checked/);
    expect(out).toMatch(/dynamic_type_mismatch — .*declares/);
  });

  it("tags an untyped slot as info, not a warning", () => {
    const legacy = report(
      ["e1", "e2", "e3"].map((edgeId) => ({
        severity: "info" as const,
        code: "untyped_dynamic_slot",
        edgeId,
        message: `Edge "${edgeId}" targets an untyped dynamic input`
      }))
    );

    const out = renderValidation(legacy).join("\n");
    expect(out).toContain("info  Edge");
    expect(out).not.toContain("warn ");
    // Info sits below the --warnings-as-errors ratchet, so a legacy workflow
    // full of untyped slots still passes it.
    expect(legacy.counts.warnings).toBe(0);
    expect(legacy.counts.info).toBe(3);
  });

  it("prints only the headline for a clean graph", () => {
    const lines = renderValidation(report([]));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("✅");
  });
});
