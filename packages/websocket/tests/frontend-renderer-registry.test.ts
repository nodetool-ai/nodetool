import { describe, expect, it, vi } from "vitest";
import {
  FrontendRendererRegistry,
  type FrontendRendererRunner
} from "../src/frontend-renderer-registry.js";

function runner(ready = true): FrontendRendererRunner & {
  connected: boolean;
} {
  return {
    connected: true,
    isRendererConnected() {
      return this.connected;
    },
    isRendererReady() {
      return ready;
    },
    getRendererToolManifest() {
      return { ui_ping: { name: "ui_ping" } };
    },
    executeRendererTool: vi.fn(async (_id, call) => ({
      renderer_id: _id,
      tool_call_id: call.tool_call_id,
      ok: true,
      result: { called: call.name, args: call.args }
    }))
  };
}

describe("FrontendRendererRegistry", () => {
  it("lists only ready renderers for the requesting user", () => {
    const registry = new FrontendRendererRegistry();
    const ready = runner(true);
    const notReady = runner(false);
    const ownId = registry.register("alice", ready);
    registry.register("alice", notReady);
    registry.register("bob", runner(true));
    registry.markReady(ownId);

    const renderers = registry.list("alice");
    expect(renderers).toHaveLength(1);
    expect(renderers[0].renderer_id).toBe(ownId);
    expect(registry.list("bob")).toHaveLength(1);
  });

  it("uses the most recently active renderer by default and allows explicit selection", async () => {
    const registry = new FrontendRendererRegistry();
    const first = runner(true);
    const second = runner(true);
    const firstId = registry.register("alice", first);
    registry.markReady(firstId);
    const secondId = registry.register("alice", second);
    registry.markReady(secondId);

    const latest = await registry.execute({
      userId: "alice",
      toolName: "ui_latest",
      args: {}
    });
    expect(latest.handled).toBe(true);
    expect(second.executeRendererTool).toHaveBeenCalled();

    await registry.execute({
      userId: "alice",
      rendererId: firstId,
      toolName: "ui_explicit",
      args: { value: 1 }
    });
    expect(first.executeRendererTool).toHaveBeenCalled();
  });

  it("rejects cross-user selection and removes disconnected renderers", () => {
    const registry = new FrontendRendererRegistry();
    const alice = runner(true);
    const rendererId = registry.register("alice", alice);
    registry.markReady(rendererId);
    expect(registry.resolve("bob", rendererId)).toBeNull();

    alice.connected = false;
    expect(registry.list("alice")).toEqual([]);
    expect(registry.size).toBe(0);
  });
});
