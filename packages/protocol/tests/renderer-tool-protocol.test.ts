import { describe, expect, it } from "vitest";
import {
  controlMessageInSchemas,
  outboundControlMessageSchemas
} from "../src/ws-commands.js";

describe("renderer tool WebSocket protocol", () => {
  it("accepts a renderer tool result as a client control frame", () => {
    const result = controlMessageInSchemas.renderer_tool_result.safeParse({
      type: "renderer_tool_result",
      renderer_id: "renderer-1",
      tool_call_id: "call-1",
      ok: true,
      result: { nodes: 3 },
      elapsed_ms: 12
    });

    expect(result.success).toBe(true);
  });

  it("accepts renderer registration and tool calls as server frames", () => {
    expect(
      outboundControlMessageSchemas.renderer_registered.safeParse({
        type: "renderer_registered",
        renderer_id: "renderer-1"
      }).success
    ).toBe(true);

    expect(
      outboundControlMessageSchemas.renderer_tool_call.safeParse({
        type: "renderer_tool_call",
        renderer_id: "renderer-1",
        tool_call_id: "call-1",
        name: "ui_get_graph",
        args: {}
      }).success
    ).toBe(true);
  });

  it("rejects renderer frames without correlation identity", () => {
    expect(
      controlMessageInSchemas.renderer_tool_result.safeParse({
        type: "renderer_tool_result",
        renderer_id: "renderer-1",
        ok: true
      }).success
    ).toBe(false);
  });

  it("rejects conflicting success and failure fields", () => {
    expect(
      controlMessageInSchemas.renderer_tool_result.safeParse({
        type: "renderer_tool_result",
        renderer_id: "renderer-1",
        tool_call_id: "call-1",
        ok: true,
        error: "conflicting failure"
      }).success
    ).toBe(false);
    expect(
      controlMessageInSchemas.renderer_tool_result.safeParse({
        type: "renderer_tool_result",
        renderer_id: "renderer-1",
        tool_call_id: "call-1",
        ok: false,
        result: { nodes: 3 },
        error: "failed"
      }).success
    ).toBe(false);
  });
});
