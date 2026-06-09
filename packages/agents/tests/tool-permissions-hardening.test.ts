/**
 * Mutation-hardening tests for the chat-agent permission gate. These pin the
 * classification table, the GatedTool forwarding getters, and the exact
 * operator-facing messages — behaviour that line coverage alone did not verify.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../src/tools/base-tool.js";
import {
  TOOL_PERMISSION_CATEGORIES,
  gateTools,
  type ApprovalDecision,
  type ApprovalRequest,
  type PermissionGateOptions,
  type PermissionMode
} from "../src/tools/tool-permissions.js";

const ctx = {} as ProcessingContext;

class FakeTool extends Tool {
  readonly inputSchema = {
    type: "object" as const,
    properties: { x: { type: "number" } },
    required: [] as string[]
  };
  ran = false;
  constructor(
    readonly name: string,
    readonly description = "fake"
  ) {
    super();
  }
  override userMessage(params: Record<string, unknown>): string {
    return `fake ran with ${Object.keys(params).join(",")}`;
  }
  async process(): Promise<unknown> {
    this.ran = true;
    return { ok: true };
  }
}

function opts(
  mode: PermissionMode,
  approve: (r: ApprovalRequest) => Promise<ApprovalDecision>,
  sessionAllow = new Set<string>()
): PermissionGateOptions {
  return { mode, sessionAllow, requestApproval: approve };
}

describe("TOOL_PERMISSION_CATEGORIES", () => {
  it("maps every tool to one of the four valid categories", () => {
    const valid = new Set(["read", "write", "execute", "external"]);
    for (const [name, category] of Object.entries(TOOL_PERMISSION_CATEGORIES)) {
      expect(valid.has(category), `${name} → ${category}`).toBe(true);
    }
  });
});

describe("GatedTool — forwarding & messages", () => {
  it("forwards inputSchema and userMessage to the inner tool", () => {
    const inner = new FakeTool("read_file");
    const gated = gateTools([inner], opts("default", async () => "allow"))[0];
    expect(gated.inputSchema).toBe(inner.inputSchema);
    expect(gated.userMessage({ x: 1 })).toBe("fake ran with x");
  });

  it("explains plan-mode blocks with the tool name and remediation", async () => {
    const inner = new FakeTool("write_file");
    const result = (await gateTools([inner], opts("plan", async () => "allow"))[0].process(
      ctx,
      {}
    )) as { message: string };
    expect(result.message).toContain("write_file");
    expect(result.message).toContain("only read-only");
    expect(result.message).toContain("concrete plan");
    expect(result.message).toContain("switch out of plan mode");
  });

  it("explains denials with the tool name and a no-retry hint", async () => {
    const inner = new FakeTool("write_file");
    const result = (await gateTools([inner], opts("default", async () => "deny"))[0].process(
      ctx,
      {}
    )) as { message: string };
    expect(result.message).toContain("write_file");
    expect(result.message).toContain("declined");
    expect(result.message).toContain("Do not retry");
    expect(result.message).toContain("propose an alternative");
  });

  it("does not persist a plain 'allow' to the session allowlist", async () => {
    const sessionAllow = new Set<string>();
    const inner = new FakeTool("write_file");
    await gateTools([inner], opts("default", async () => "allow", sessionAllow))[0].process(
      ctx,
      {}
    );
    expect(inner.ran).toBe(true);
    expect(sessionAllow.has("write_file")).toBe(false);
  });
});
