/**
 * The gate contract a host below `@nodetool-ai/agents` sets on its context:
 * the decision matrix and the headless gate that denies every escalation.
 */

import { describe, expect, it, vi } from "vitest";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  decidePermission,
  headlessDenialReason,
  headlessGate,
  type PermissionCategory,
  type PermissionMode
} from "../src/permission-gate.js";
import { ProcessingContext } from "../src/context.js";

const CATEGORIES: readonly PermissionCategory[] = [
  "read",
  "write",
  "execute",
  "external"
];

describe("decidePermission", () => {
  it("always allows read", () => {
    for (const mode of ["plan", "default", "auto"] as PermissionMode[]) {
      expect(decidePermission(mode, "read")).toBe("allow");
    }
  });

  it("allows everything in auto, blocks in plan, asks in default", () => {
    for (const category of CATEGORIES.filter((c) => c !== "read")) {
      expect(decidePermission("auto", category)).toBe("allow");
      expect(decidePermission("plan", category)).toBe("block");
      expect(decidePermission("default", category)).toBe("ask");
    }
  });
});

describe("headlessGate", () => {
  it("is auto with an empty allow-set and denies, naming the host", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const gate = headlessGate("kernel workflow run");

      expect(gate.mode).toBe("auto");
      expect(gate.sessionAllow.size).toBe(0);
      await expect(
        gate.requestApproval({
          toolName: "delete_workflow",
          category: "write",
          args: {},
          message: "Delete the workflow"
        })
      ).resolves.toBe("deny");
      const reported = String(warn.mock.calls[0]?.[0]);
      expect(reported).toContain("delete_workflow");
      expect(reported).toContain(headlessDenialReason("kernel workflow run"));
    } finally {
      warn.mockRestore();
    }
  });

  it("travels on the context bag and is shared by a copy, not cloned", () => {
    const context = new ProcessingContext({ jobId: "job-1", userId: "1" });
    const gate = headlessGate("kernel workflow run");
    context.set(PERMISSION_GATE_CONTEXT_KEY, gate);

    expect(context.copy().get(PERMISSION_GATE_CONTEXT_KEY)).toBe(gate);
  });
});
