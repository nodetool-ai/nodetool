/**
 * Client tools that spend money pass the turn's permission gate before the
 * browser round trip. They used to be dispatched straight to the ToolBridge,
 * so `ui_storyboard_generate_clip` rendered paid video in plan mode and
 * without an approval in default mode.
 */
import { describe, expect, it, vi } from "vitest";
import { createCapabilityRun, type CapabilityRun } from "@nodetool-ai/agents";
import { ProcessingContext, type PermissionMode } from "@nodetool-ai/runtime";
import {
  dispatchClientTool,
  SPENDING_CLIENT_TOOL_NAMES
} from "../src/session/client-tool-gate.js";

function runWith(mode: PermissionMode, answer: "allow" | "deny" | "allow_for_chat" = "allow") {
  const requestApproval = vi.fn(async () => answer);
  const run: CapabilityRun = createCapabilityRun({
    context: new ProcessingContext({ jobId: "test", userId: "u1" }),
    gate: { mode, sessionAllow: new Set<string>(), requestApproval }
  });
  return { run, requestApproval };
}

const ARGS = { storyboard_id: "sb1", target: "all" };

describe("dispatchClientTool", () => {
  it("blocks a spending client tool in plan mode without reaching the browser", async () => {
    const { run, requestApproval } = runWith("plan");
    const dispatch = vi.fn(async () => ({ ok: true }));
    const result = await dispatchClientTool(run, "ui_storyboard_generate_clip", ARGS, dispatch);
    expect(result).toMatchObject({ error: "blocked_in_plan_mode" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("asks in default mode and dispatches only on approval", async () => {
    const denied = runWith("default", "deny");
    const dispatch = vi.fn(async () => ({ ok: true }));
    const refused = await dispatchClientTool(denied.run, "ui_storyboard_generate_keyframe", ARGS, dispatch);
    expect(refused).toMatchObject({ error: "permission_denied" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(denied.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "ui_storyboard_generate_keyframe", args: ARGS })
    );

    const allowed = runWith("default", "allow");
    const result = await dispatchClientTool(allowed.run, "ui_storyboard_generate_keyframe", ARGS, dispatch);
    expect(result).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("runs without asking in auto mode", async () => {
    const { run, requestApproval } = runWith("auto");
    const dispatch = vi.fn(async () => ({ ok: true }));
    expect(await dispatchClientTool(run, "ui_script_voice_all", {}, dispatch)).toEqual({ ok: true });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("leaves a client tool that spends nothing ungated", async () => {
    const { run, requestApproval } = runWith("plan");
    const dispatch = vi.fn(async () => ({ shots: [] }));
    expect(await dispatchClientTool(run, "ui_storyboard_get_state", ARGS, dispatch)).toEqual({ shots: [] });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("refuses a spending tool when the turn has no gate", async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    const result = await dispatchClientTool(null, "ui_sketch_generate", {}, dispatch);
    expect(result).toMatchObject({ error: "permission_unavailable" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("covers both storyboard generate tools and the revision", () => {
    for (const name of [
      "ui_storyboard_generate_keyframe",
      "ui_storyboard_generate_clip",
      "ui_storyboard_revise_shot"
    ]) {
      expect(SPENDING_CLIENT_TOOL_NAMES.has(name), name).toBe(true);
    }
  });
});
