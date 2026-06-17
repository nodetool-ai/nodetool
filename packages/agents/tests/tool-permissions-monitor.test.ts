/**
 * Integration tests for GatedTool × the optional security monitor consult.
 *
 * Pins the contract: read-class tools are never consulted; an allow verdict
 * passes through; HARD and SOFT blocks both stop execution with a structured
 * error; an absent monitor leaves the gate byte-for-byte unchanged; and the
 * monitor is consulted only AFTER the mode decision allows and (in default
 * mode) AFTER approval succeeds, but BEFORE the inner tool runs.
 */

import { describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../src/tools/base-tool.js";
import {
  gateTools,
  type ApprovalDecision,
  type ApprovalRequest,
  type PermissionGateOptions,
  type PermissionMode
} from "../src/tools/tool-permissions.js";
import type {
  PendingAction,
  SecurityVerdict
} from "../src/security-monitor.js";

const ctx = {} as ProcessingContext;

/** Minimal inner tool that records whether it ran. */
class FakeTool extends Tool {
  readonly inputSchema = {
    type: "object" as const,
    properties: {},
    required: [] as string[]
  };
  ran = false;
  constructor(
    readonly name: string,
    readonly description = "fake"
  ) {
    super();
  }
  async process(): Promise<unknown> {
    this.ran = true;
    return { ok: true };
  }
}

const ALLOW: SecurityVerdict = {
  block: false,
  tier: "none",
  severity: "low",
  reason: ""
};

function gateOne(
  inner: Tool,
  mode: PermissionMode,
  overrides: Partial<PermissionGateOptions> = {}
): Tool {
  const opts: PermissionGateOptions = {
    mode,
    sessionAllow: new Set<string>(),
    requestApproval: async () => "allow",
    ...overrides
  };
  return gateTools([inner], opts)[0];
}

describe("GatedTool × security monitor", () => {
  it("NEVER consults the monitor for read-class tools", async () => {
    const inner = new FakeTool("read_file");
    const monitor = vi.fn(async (): Promise<SecurityVerdict> => ALLOW);
    const gated = gateOne(inner, "auto", { securityMonitor: monitor });

    const result = await gated.process(ctx, {});
    expect(monitor).not.toHaveBeenCalled();
    expect(inner.ran).toBe(true);
    expect(result).toEqual({ ok: true });
  });

  it("runs inner.process() when the verdict allows", async () => {
    const inner = new FakeTool("write_file");
    const monitor = vi.fn(async (): Promise<SecurityVerdict> => ALLOW);
    const gated = gateOne(inner, "auto", { securityMonitor: monitor });

    const result = await gated.process(ctx, {});
    expect(monitor).toHaveBeenCalledTimes(1);
    expect(inner.ran).toBe(true);
    expect(result).toEqual({ ok: true });
  });

  it("stops execution on a HARD block and returns a structured error", async () => {
    const inner = new FakeTool("http_request");
    const monitor = vi.fn(
      async (): Promise<SecurityVerdict> => ({
        block: true,
        tier: "hard",
        severity: "critical",
        reason: "uploading secrets to an external host"
      })
    );
    const gated = gateOne(inner, "auto", { securityMonitor: monitor });

    const result = (await gated.process(ctx, {})) as {
      error: string;
      message: string;
    };
    expect(inner.ran).toBe(false);
    expect(result.error).toBe("blocked_by_security_monitor");
    expect(result.message).toContain("uploading secrets");
    expect(result.message.toLowerCase()).toContain("hard");
  });

  it("stops execution on a SOFT block (gate trusts the returned block flag)", async () => {
    const inner = new FakeTool("run_code");
    const monitor = vi.fn(
      async (): Promise<SecurityVerdict> => ({
        block: true,
        tier: "soft",
        severity: "high",
        reason: "bulk file deletion"
      })
    );
    const gated = gateOne(inner, "auto", { securityMonitor: monitor });

    const result = (await gated.process(ctx, {})) as {
      error: string;
      message: string;
    };
    expect(inner.ran).toBe(false);
    expect(result.error).toBe("blocked_by_security_monitor");
    expect(result.message.toLowerCase()).toContain("soft");
  });

  it("is unchanged when no monitor is supplied (regression guard)", async () => {
    // auto → runs
    const autoTool = new FakeTool("write_file");
    expect(await gateOne(autoTool, "auto").process(ctx, {})).toEqual({
      ok: true
    });
    expect(autoTool.ran).toBe(true);

    // plan → blocked in plan mode
    const planTool = new FakeTool("write_file");
    const planResult = (await gateOne(planTool, "plan").process(ctx, {})) as {
      error: string;
    };
    expect(planResult.error).toBe("blocked_in_plan_mode");
    expect(planTool.ran).toBe(false);

    // default + deny → permission_denied
    const denyTool = new FakeTool("write_file");
    const denyResult = (await gateOne(denyTool, "default", {
      requestApproval: async () => "deny"
    }).process(ctx, {})) as { error: string };
    expect(denyResult.error).toBe("permission_denied");
    expect(denyTool.ran).toBe(false);

    // default + allow → runs
    const askTool = new FakeTool("write_file");
    expect(
      await gateOne(askTool, "default", {
        requestApproval: async () => "allow"
      }).process(ctx, {})
    ).toEqual({ ok: true });
    expect(askTool.ran).toBe(true);
  });

  it("consults the monitor AFTER approval succeeds but BEFORE inner runs", async () => {
    const calls: string[] = [];
    const inner = new FakeTool("write_file");
    const originalProcess = inner.process.bind(inner);
    inner.process = vi.fn(async (...args: Parameters<Tool["process"]>) => {
      calls.push("inner");
      return originalProcess(...args);
    });

    const requestApproval = vi.fn(
      async (r: ApprovalRequest): Promise<ApprovalDecision> => {
        void r;
        calls.push("approval");
        return "allow";
      }
    );
    const monitor = vi.fn(async (): Promise<SecurityVerdict> => {
      calls.push("monitor");
      return {
        block: true,
        tier: "hard",
        severity: "high",
        reason: "blocked"
      };
    });

    const gated = gateOne(inner, "default", {
      requestApproval,
      securityMonitor: monitor
    });
    const result = (await gated.process(ctx, {})) as { error: string };

    expect(calls).toEqual(["approval", "monitor"]);
    expect(inner.ran).toBe(false);
    expect(result.error).toBe("blocked_by_security_monitor");
  });

  it("vets actionable tools through the monitor in auto mode and blocks", async () => {
    const inner = new FakeTool("run_workflow");
    const monitor = vi.fn(
      async (): Promise<SecurityVerdict> => ({
        block: true,
        tier: "soft",
        severity: "medium",
        reason: "production deploy"
      })
    );
    const gated = gateOne(inner, "auto", {
      requestApproval: async () => "allow",
      securityMonitor: monitor
    });

    const result = (await gated.process(ctx, {})) as { error: string };
    expect(monitor).toHaveBeenCalledTimes(1);
    expect(inner.ran).toBe(false);
    expect(result.error).toBe("blocked_by_security_monitor");
  });

  it("forwards the recentTranscript string into the PendingAction", async () => {
    const inner = new FakeTool("write_file");
    let seen: PendingAction | undefined;
    const monitor = vi.fn(async (action: PendingAction) => {
      seen = action;
      return ALLOW;
    });
    const recentTranscript = vi.fn(() => "user: please write the report");
    const gated = gateOne(inner, "auto", {
      securityMonitor: monitor,
      recentTranscript
    });

    await gated.process(ctx, {});
    expect(recentTranscript).toHaveBeenCalled();
    expect(seen?.transcript).toBe("user: please write the report");
    expect(seen?.name).toBe("write_file");
    expect(seen?.category).toBe("write");
  });
});
