/**
 * Phase 0 inventory pin for the four SDK-related tRPC procedures and their
 * in-repository callers (docs/sdk/sdk-trpc-consolidation.md § Phase 0).
 *
 * These procedures are NOT unused: the unified WebSocket runner serves the
 * four SDK discovery commands through an in-process tRPC caller. Phase 3
 * migrates those call sites onto the shared service boundary — when it does,
 * this test is updated deliberately, together with the caller inventory in
 * docs/sdk/phase-0-baseline-2026-08-22.md. Until then, a rename, removal, or
 * silent extra caller fails here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import {
  sdkWorkflowSummariesInput,
  sdkWorkflowSummariesOutput,
  workflowInterfaceInput,
  workflowInterfaceV1,
  workflowInterfacesInput,
  workflowInterfacesOutput
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  sdkNodeTypeInventoryInput,
  sdkNodeTypeInventoryOutput
} from "@nodetool-ai/protocol/api-schemas/nodes.js";

interface ProcedureDef {
  type: string;
  inputs: unknown[];
  output: unknown;
}

function procedureDef(name: string): ProcedureDef {
  const procedures = (
    appRouter as unknown as {
      _def: { procedures: Record<string, { _def: ProcedureDef } | undefined> };
    }
  )._def.procedures;
  const procedure = procedures[name];
  expect(procedure, `appRouter is missing procedure ${name}`).toBeDefined();
  // SAFETY: the expect above fails the test when the procedure is absent.
  return procedure!._def;
}

const RUNNER_SOURCE_URL = new URL(
  "../src/unified-websocket-runner.ts",
  import.meta.url
);

function countMatches(source: string, pattern: RegExp): number {
  return source.match(new RegExp(pattern, "g"))?.length ?? 0;
}

describe("SDK v1 tRPC procedure and caller inventory (Phase 0 pin)", () => {
  it("exposes the four SDK-related procedures with the protocol schemas", () => {
    const expected: Array<{
      name: string;
      input: unknown;
      output: unknown;
    }> = [
      {
        name: "workflows.sdkSummaries",
        input: sdkWorkflowSummariesInput,
        output: sdkWorkflowSummariesOutput
      },
      {
        name: "workflows.interface",
        input: workflowInterfaceInput,
        output: workflowInterfaceV1
      },
      {
        name: "workflows.interfaces",
        input: workflowInterfacesInput,
        output: workflowInterfacesOutput
      },
      {
        name: "nodes.sdkTypeInventory",
        input: sdkNodeTypeInventoryInput,
        output: sdkNodeTypeInventoryOutput
      }
    ];

    for (const { name, input, output } of expected) {
      const def = procedureDef(name);
      expect(def.type, name).toBe("query");
      expect(def.inputs, name).toHaveLength(1);
      // Identity, not shape: the procedure must validate with the very
      // schema objects @nodetool-ai/protocol exports.
      expect(def.inputs[0], `${name} input schema`).toBe(input);
      expect(def.output, `${name} output schema`).toBe(output);
    }
  });

  it("pins the runner's in-process tRPC call sites for the SDK commands", () => {
    const source = readFileSync(RUNNER_SOURCE_URL, "utf8");

    // One call site each. `caller.workflows.interface(` cannot match the
    // plural form: the literal `(` follows `interface` in the pattern.
    expect(countMatches(source, /caller\.workflows\.sdkSummaries\(/)).toBe(1);
    expect(countMatches(source, /caller\.workflows\.interface\(/)).toBe(1);
    expect(countMatches(source, /caller\.workflows\.interfaces\(/)).toBe(1);
    expect(countMatches(source, /caller\.nodes\.sdkTypeInventory\(/)).toBe(1);

    // The commands that dispatch onto them, and the two lifecycle commands
    // that bypass tRPC via handleSdkV1LifecycleRpc.
    for (const command of [
      "list_workflow_summaries",
      "get_workflow_interface",
      "get_workflow_interfaces",
      "get_node_type_inventory",
      "get_capabilities",
      "preflight_workflow"
    ]) {
      expect(
        countMatches(source, new RegExp(`case "${command}":`)),
        command
      ).toBe(1);
    }
    expect(countMatches(source, /runSdkLifecycleRpc\(command\)/)).toBe(1);
  });
});
