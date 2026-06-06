/**
 * Unit tests for the chat-agent permission gate: classification, the
 * mode × category decision matrix, and the GatedTool wrapper behavior.
 */

import { describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../src/tools/base-tool.js";
import {
  permissionCategoryFor,
  decidePermission,
  gateTools,
  type ApprovalDecision,
  type ApprovalRequest,
  type PermissionMode
} from "../src/tools/tool-permissions.js";

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

function gateOne(
  inner: Tool,
  mode: PermissionMode,
  requestApproval: (r: ApprovalRequest) => Promise<ApprovalDecision>,
  sessionAllow = new Set<string>()
): Tool {
  return gateTools([inner], { mode, sessionAllow, requestApproval })[0];
}

describe("permissionCategoryFor", () => {
  it("classifies known tools", () => {
    expect(permissionCategoryFor("read_file")).toBe("read");
    expect(permissionCategoryFor("google_search")).toBe("read");
    expect(permissionCategoryFor("write_file")).toBe("write");
    expect(permissionCategoryFor("run_node")).toBe("execute");
    expect(permissionCategoryFor("run_workflow")).toBe("execute");
    expect(permissionCategoryFor("browser")).toBe("external");
  });

  it("defaults unknown tools to the conservative external class", () => {
    expect(permissionCategoryFor("some_new_unlisted_tool")).toBe("external");
  });
});

describe("decidePermission", () => {
  it("always allows read tools", () => {
    for (const mode of ["plan", "default", "auto"] as PermissionMode[]) {
      expect(decidePermission(mode, "read")).toBe("allow");
    }
  });

  it("blocks actions in plan, asks in default, allows in auto", () => {
    for (const category of ["write", "execute", "external"] as const) {
      expect(decidePermission("plan", category)).toBe("block");
      expect(decidePermission("default", category)).toBe("ask");
      expect(decidePermission("auto", category)).toBe("allow");
    }
  });
});

describe("GatedTool", () => {
  it("forwards identity and schema to the inner tool", () => {
    const inner = new FakeTool("read_file", "reads a file");
    const gated = gateOne(inner, "default", async () => "allow");
    expect(gated.name).toBe("read_file");
    expect(gated.description).toBe("reads a file");
    expect(gated.toProviderTool().name).toBe("read_file");
  });

  it("runs read tools without approval in every mode", async () => {
    const approve = vi.fn(async () => "allow" as ApprovalDecision);
    for (const mode of ["plan", "default", "auto"] as PermissionMode[]) {
      const inner = new FakeTool("read_file");
      await gateOne(inner, mode, approve).process(ctx, {});
      expect(inner.ran).toBe(true);
    }
    expect(approve).not.toHaveBeenCalled();
  });

  it("blocks actionable tools in plan mode without running them", async () => {
    const approve = vi.fn(async () => "allow" as ApprovalDecision);
    const inner = new FakeTool("write_file");
    const result = (await gateOne(inner, "plan", approve).process(
      ctx,
      {}
    )) as { error?: string };
    expect(result.error).toBe("blocked_in_plan_mode");
    expect(inner.ran).toBe(false);
    expect(approve).not.toHaveBeenCalled();
  });

  it("runs actionable tools without approval in auto mode", async () => {
    const approve = vi.fn(async () => "allow" as ApprovalDecision);
    const inner = new FakeTool("write_file");
    await gateOne(inner, "auto", approve).process(ctx, {});
    expect(inner.ran).toBe(true);
    expect(approve).not.toHaveBeenCalled();
  });

  it("asks for approval in default mode and runs on allow", async () => {
    const approve = vi.fn(async () => "allow" as ApprovalDecision);
    const inner = new FakeTool("write_file");
    await gateOne(inner, "default", approve).process(ctx, {});
    expect(approve).toHaveBeenCalledTimes(1);
    expect(inner.ran).toBe(true);
  });

  it("returns permission_denied and does not run on deny", async () => {
    const approve = vi.fn(async () => "deny" as ApprovalDecision);
    const inner = new FakeTool("write_file");
    const result = (await gateOne(inner, "default", approve).process(
      ctx,
      {}
    )) as { error?: string };
    expect(result.error).toBe("permission_denied");
    expect(inner.ran).toBe(false);
  });

  it("remembers 'allow_for_chat' so the next call skips approval", async () => {
    const approve = vi.fn(async () => "allow_for_chat" as ApprovalDecision);
    const sessionAllow = new Set<string>();
    const opts = { mode: "default" as PermissionMode, sessionAllow, requestApproval: approve };

    const first = new FakeTool("write_file");
    await gateTools([first], opts)[0].process(ctx, {});
    expect(approve).toHaveBeenCalledTimes(1);
    expect(sessionAllow.has("write_file")).toBe(true);

    const second = new FakeTool("write_file");
    await gateTools([second], opts)[0].process(ctx, {});
    // Still only called once — the second call was pre-approved.
    expect(approve).toHaveBeenCalledTimes(1);
    expect(second.ran).toBe(true);
  });

  it("passes the stripped args and resolved message to the approval prompt", async () => {
    let captured: ApprovalRequest | null = null;
    const approve = async (r: ApprovalRequest) => {
      captured = r;
      return "allow" as ApprovalDecision;
    };
    const inner = new FakeTool("run_workflow");
    await gateOne(inner, "default", approve).process(ctx, {
      workflow_id: "wf-1",
      _message: "Running the pipeline"
    });
    expect(captured).not.toBeNull();
    expect(captured!.toolName).toBe("run_workflow");
    expect(captured!.category).toBe("execute");
    expect(captured!.message).toBe("Running the pipeline");
    // _message must be stripped from the args shown to the user.
    expect(captured!.args).toEqual({ workflow_id: "wf-1" });
  });
});
