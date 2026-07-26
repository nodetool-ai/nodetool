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
  return {
    ok: errors === 0,
    nodeCount: 2,
    edgeCount: 1,
    counts: { errors, warnings: issues.length - errors },
    issues
  };
}

describe("renderValidation", () => {
  it("explains every code it printed", () => {
    const out = renderValidation(
      report([
        {
          severity: "warning",
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

  it("names untyped slots as the sole reason --warnings-as-errors fails", () => {
    const legacy = report(
      ["e1", "e2", "e3"].map((edgeId) => ({
        severity: "warning" as const,
        code: "untyped_dynamic_slot",
        edgeId,
        message: `Edge "${edgeId}" targets an untyped dynamic input`
      }))
    );

    expect(renderValidation(legacy, { warningsAsErrors: true }).join("\n"))
      .toContain("Every warning is untyped_dynamic_slot");
    // Without the flag the report stays plain — nothing failed.
    expect(renderValidation(legacy).join("\n")).not.toContain(
      "Every warning is untyped_dynamic_slot"
    );
  });

  it("omits the note when other warnings are present", () => {
    const mixed = report([
      {
        severity: "warning",
        code: "untyped_dynamic_slot",
        edgeId: "e1",
        message: "untyped"
      },
      {
        severity: "warning",
        code: "type_mismatch",
        edgeId: "e2",
        message: "types may be incompatible"
      }
    ]);
    expect(
      renderValidation(mixed, { warningsAsErrors: true }).join("\n")
    ).not.toContain("Every warning is untyped_dynamic_slot");
  });

  it("prints only the headline for a clean graph", () => {
    const lines = renderValidation(report([]));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("✅");
  });
});
