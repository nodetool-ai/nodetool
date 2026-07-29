/**
 * RunNodeTool — the `run_node` agent tool. Exercises the thin wrapper around
 * a `runNode` callback: param coercion, missing/empty node_type, inputs
 * normalization, delegation, and userMessage.
 */
import { describe, it, expect, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { RunNodeTool } from "../src/agent/run-node-tool.js";

const ctx = undefined as unknown as ProcessingContext;

describe("RunNodeTool", () => {
  it("exposes name, description and a schema requiring node_type", () => {
    const tool = new RunNodeTool(async () => ({}));
    expect(tool.name).toBe("run_node");
    expect(tool.description).toMatch(/Run a single NodeTool node/);
    // jsonSchema is protected; read it structurally to assert the contract.
    const schema = (tool as unknown as { jsonSchema: Record<string, unknown> })
      .jsonSchema;
    expect(schema.required).toEqual(["node_type"]);
    expect((schema.properties as Record<string, unknown>).node_type).toBeDefined();
    expect((schema.properties as Record<string, unknown>).inputs).toBeDefined();
  });

  it("delegates to runNode with node_type and inputs", async () => {
    const runNode = vi.fn(async () => ({ ok: true }));
    const tool = new RunNodeTool(runNode);
    const result = await tool.process(ctx, {
      node_type: "nodetool.text.Concat",
      inputs: { a: "hi ", b: "there" },
    });
    expect(runNode).toHaveBeenCalledWith("nodetool.text.Concat", {
      a: "hi ",
      b: "there",
    });
    expect(result).toEqual({ ok: true });
  });

  it("defaults inputs to an empty object when omitted", async () => {
    const runNode = vi.fn(async () => "done");
    const tool = new RunNodeTool(runNode);
    const result = await tool.process(ctx, { node_type: "nodetool.image.Blur" });
    expect(runNode).toHaveBeenCalledWith("nodetool.image.Blur", {});
    expect(result).toBe("done");
  });

  it("defaults inputs to {} when inputs is not an object", async () => {
    const runNode = vi.fn(async () => null);
    const tool = new RunNodeTool(runNode);
    await tool.process(ctx, { node_type: "x", inputs: "not-an-object" });
    expect(runNode).toHaveBeenCalledWith("x", {});
  });

  it("treats a null inputs value as no inputs", async () => {
    const runNode = vi.fn(async () => 1);
    const tool = new RunNodeTool(runNode);
    await tool.process(ctx, { node_type: "x", inputs: null });
    expect(runNode).toHaveBeenCalledWith("x", {});
  });

  it("returns an error and never calls runNode when node_type is missing", async () => {
    const runNode = vi.fn(async () => ({}));
    const tool = new RunNodeTool(runNode);
    const result = await tool.process(ctx, {});
    expect(result).toEqual({ error: "node_type is required" });
    expect(runNode).not.toHaveBeenCalled();
  });

  it("returns an error when node_type is an empty string", async () => {
    const runNode = vi.fn(async () => ({}));
    const tool = new RunNodeTool(runNode);
    const result = await tool.process(ctx, { node_type: "" });
    expect(result).toEqual({ error: "node_type is required" });
    expect(runNode).not.toHaveBeenCalled();
  });

  it("coerces a non-string node_type via String()", async () => {
    const runNode = vi.fn(async () => "ok");
    const tool = new RunNodeTool(runNode);
    await tool.process(ctx, { node_type: 123 as unknown as string });
    expect(runNode).toHaveBeenCalledWith("123", {});
  });

  it("propagates rejections from the runNode callback", async () => {
    const tool = new RunNodeTool(async () => {
      throw new Error("boom");
    });
    await expect(
      tool.process(ctx, { node_type: "x" }),
    ).rejects.toThrow("boom");
  });

  it("userMessage names the node when given, and is generic otherwise", () => {
    const tool = new RunNodeTool(async () => ({}));
    expect(tool.userMessage({ node_type: "nodetool.text.Concat" })).toBe(
      "Running node nodetool.text.Concat",
    );
    expect(tool.userMessage({})).toBe("Running node");
  });
});
