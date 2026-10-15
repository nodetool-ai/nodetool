import { afterEach, describe, expect, it } from "vitest";
import { BaseNode, NodeRegistry, getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { FLOW_CAPABILITIES, setFlowBackend } from "../src/capabilities/flow.js";
import * as backend from "../../dsl/src/flow/index.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import { buildToolBridge, type ToolResultRecord } from "../src/codeact/tool-api.js";

class CatalogFixture extends BaseNode {
  static readonly nodeType = "huggingface.test.DynamicMissing";
  static readonly title = "Dynamic fixture";
  static readonly description = "";
  static readonly metadataOutputTypes = { output: "str" };
  async process(): Promise<Record<string, unknown>> { throw new Error("missing node must never run"); }
}
class Echo extends BaseNode {
  static readonly nodeType = "test.DynamicEcho";
  static readonly title = "Echo";
  static readonly description = "";
  static readonly metadataOutputTypes = { output: "str" };
  async process(): Promise<Record<string, unknown>> { return { output: "continued" }; }
}

afterEach(() => setFlowBackend(null));

describe("dynamic node pack refusals", () => {
  it("marks structured pack refusals as errors in the real tool bridge while returning guest data", async () => {
    const missing = createMissingPackError("game", ["fixture.LazyGame"]).details;
    const observed: ToolResultRecord[] = [];
    const bridge = buildToolBridge({ tools: [{ name: "run_node" }], invoke: async () => missing, onToolResult: record => observed.push(record) });
    const call = bridge.globals.__callTool;
    if (typeof call !== "function") {
      throw new Error("Tool bridge callable is missing");
    }
    expect(await call("run_node", "{}")).toEqual({ ok: true, result: missing });
    expect(observed).toEqual([{ name: "run_node", toolCallId: "codeact_1", result: missing, isError: true }]);
  });
  it("keeps run_node missing-pack details available to guest code and continues", async () => {
    const missing = createMissingPackError("huggingface", [CatalogFixture.nodeType]).details;
    const calls: string[] = [];
    const session = createChatCodeActSession({
      tools: [{ name: "run_node", description: "Run a node", inputSchema: { type: "object", properties: {} } }],
      executeTool: async (call) => {
        const type = String(call.args.node_type);
        calls.push(type);
        return JSON.stringify(type === CatalogFixture.nodeType ? missing : { output: "continued" });
      }
    });
    const observation = JSON.parse(await session.executeAction({ code: `
      const missing = await nodetool.nodes.run(${JSON.stringify(CatalogFixture.nodeType)});
      const continued = await nodetool.nodes.run(${JSON.stringify(Echo.nodeType)});
      return { missing, continued };
    ` }));
    expect(observation).toMatchObject({ ok: true, result: { missing: { error: "missing_pack", packs: [{ id: "huggingface" }] }, continued: { output: "continued" } } });
    expect(calls).toEqual([CatalogFixture.nodeType, Echo.nodeType]);
  });
  it.each(["invoke_node", "open_node_stream"])("returns structured %s errors and continues the same run", async (name) => {
    const registry = new NodeRegistry();
    registry.loadCatalog([{ node_type: CatalogFixture.nodeType, pack: "huggingface", metadata: getNodeMetadata(CatalogFixture), declared: [] }]);
    registry.register(Echo);
    let created = 0;
    let closed = 0;
    setFlowBackend({
      ...backend,
      async createFlowForContext(context) {
        created++;
        const flow = await backend.createFlowForContext(context, { registry });
        const close = flow.close.bind(flow);
        flow.close = async () => { closed++; await close(); };
        return flow;
      }
    });
    const run = createCapabilityRun({ context: new ProcessingContext({ jobId: "dynamic", workflowId: null }), gate: UNGATED, capabilities: FLOW_CAPABILITIES });
    expect(await run.invoke(name, { type: CatalogFixture.nodeType })).toMatchObject({
      error: "missing_pack", packs: [{ id: "huggingface" }], nodeTypes: [CatalogFixture.nodeType], restartRequired: false
    });
    expect(created).toBe(1);
    expect(closed).toBe(1);
    expect(await run.invoke("invoke_node", { type: Echo.nodeType })).toEqual({ output: "continued" });
    expect(created).toBe(2);
    expect(closed).toBe(2);
    const session = createChatCodeActSession({ tools: [], capabilityRun: run, executeTool: async (call) => run.invoke(call.name, call.args) });
    const observation = JSON.parse(await session.executeAction({ code: `
      import { ${name}, invoke_node as invoke } from ${JSON.stringify(sandboxCapabilitySpecifier("flow"))};
      const missing = await ${name}({ type: ${JSON.stringify(CatalogFixture.nodeType)} });
      const continued = await invoke({ type: ${JSON.stringify(Echo.nodeType)} });
      return { missing, continued };
    ` }));
    expect(observation).toMatchObject({ ok: true, result: { missing: { error: "missing_pack", packs: [{ id: "huggingface" }] }, continued: { output: "continued" } } });
    expect(created).toBe(4);
    expect(closed).toBe(4);
  });

  it.each(["execute", "read"] as const)("preserves lazy pack-library details without retrying a %s capability", async (category) => {
    let calls = 0;
    const error = createMissingPackError("game");
    const run = createCapabilityRun({
      context: new ProcessingContext({ jobId: "lazy-pack", workflowId: null }), gate: UNGATED,
      capabilities: [{ spec: { name: "fixture_lazy_pack", description: "", category, inputSchema: { type: "object", properties: {} } },
        impl: async () => { calls++; throw new Error("wrapped library failure", { cause: error }); } }]
    });
    expect(await run.invoke("fixture_lazy_pack", {})).toEqual(error.details);
    expect(calls).toBe(1);
  });

  it("releases a stream after a lazy pack failure and keeps the run usable", async () => {
    const missing = createMissingPackError("game");
    let streamed = 0;
    let closed = 0;
    setFlowBackend({
      createFlowForContext: async () => ({ close: async () => { closed++; } }),
      invoke: async () => ({ output: "continued" }),
      invokeStream: async function* () { streamed++; yield await Promise.reject<Record<string, unknown>>(missing); }
    });
    const run = createCapabilityRun({ context: new ProcessingContext({ jobId: "lazy-stream", workflowId: null }), gate: UNGATED, capabilities: FLOW_CAPABILITIES });
    const open = await run.invoke("open_node_stream", { type: "test.LazyLibrary" });
    expect(open).toMatchObject({ stream_id: expect.any(String) });
    expect(await run.invoke("take_node_stream", open as Record<string, unknown>)).toEqual(missing.details);
    expect(streamed).toBe(1);
    expect(closed).toBe(1);
    expect(await run.invoke("close_node_stream", open as Record<string, unknown>)).toEqual({ closed: true, was_open: false });
    expect(await run.invoke("invoke_node", { type: Echo.nodeType })).toEqual({ output: "continued" });
    expect(closed).toBe(2);
  });
});
