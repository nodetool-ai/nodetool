import { describe, expect, it, vi } from "vitest";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { buildControlTools } from "../src/nodes/agent-control-tools.js";
import { WorkflowRunner } from "../../kernel/src/runner.js";
import { buildToolBridge, type ToolResultRecord } from "../../agents/src/codeact/tool-api.js";
import { processingMessageSchema } from "@nodetool-ai/protocol";

describe("agent control missing packs", () => {
  it("preserves real actor failures and continues controlled execution without supervisor retry", async () => {
    const context = new ProcessingContext({ jobId: "real-control-pack", workflowId: null });
    const missing = createMissingPackError("game", ["fixture.LazyGame"]);
    const observed: Record<string, unknown>[] = [];
    const process = vi.fn(async (inputs: Record<string, unknown>) => {
      if (inputs.mode !== "fallback") {
        throw missing;
      }
      return { output: "resumed" };
    });
    const decide = vi.fn(async () => ({ verdict: { action: "retry" as const }, decidedBy: "agent" as const, costUsd: 0 }));
    const tools = buildControlTools({
      missing: { node_type: "fixture.LazyGame", node_title: "Lazy game", control_actions: { run: { properties: { mode: { type: "string" } } } } },
      available: { node_type: "fixture.Echo", node_title: "Echo" }
    });
    const missingTool = tools[0];
    const availableTool = tools[1];
    if (!missingTool || !availableTool) {
      throw new Error("Control fixture tools were not constructed");
    }
    const toolResults: ToolResultRecord[] = [];
    const bridge = buildToolBridge({
      tools,
      invoke: async (name, args) => {
        const tool = tools.find(candidate => candidate.name === name);
        if (!tool) {
          throw new Error(`Unknown control fixture tool ${name}`);
        }
        return tool.process(context, args);
      },
      onToolResult: record => toolResults.push(record)
    });
    const call = bridge.globals.__callTool;
    if (typeof call !== "function") {
      throw new Error("Control tool bridge callable is missing");
    }
    const invoke = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const envelope = await call(name, JSON.stringify(args));
      if (!envelope.ok) {
        throw new Error(envelope.error);
      }
      return envelope.result;
    };
    const runner = new WorkflowRunner("real-control-pack", {
      executionContext: context,
      supervisor: { decide, close() {} },
      resolveExecutor: (node) => {
        if (node.id === "controller") {
          return {
            process: async () => ({}),
            async *genProcess() {
              observed.push(await invoke(missingTool.name, {}));
              observed.push(await invoke(availableTool.name, {}));
              observed.push(await invoke(missingTool.name, { mode: "fallback" }));
              yield { output: "continued" };
            }
          };
        }
        return node.id === "missing" ? { process } : { process: async () => ({ output: "alternative" }) };
      }
    });
    const result = await runner.run({ job_id: "real-control-pack" }, {
      nodes: [
        { id: "controller", type: "fixture.Controller", is_streaming_output: true, outputs: { __control__: "control", output: "str" } },
        { id: "missing", type: "fixture.LazyGame", is_controlled: true, outputs: { output: "str" } },
        { id: "available", type: "fixture.Echo", is_controlled: true, outputs: { output: "str" } }
      ],
      edges: ["missing", "available"].map(target => ({ id: `control-${target}`, source: "controller", sourceHandle: "__control__", target, targetHandle: "__control__", edge_type: "control" }))
    });
    expect(observed[0]).toMatchObject({ ...missing.details, status: "error", target_node_id: "missing" });
    expect(observed[1]).toMatchObject({ status: "completed", result: { output: "alternative" } });
    expect(observed[2]).toMatchObject({ status: "completed", result: { output: "resumed" } });
    expect(result.status).toBe("completed");
    expect(result.error).toBeUndefined();
    expect(result.missingPack).toBeUndefined();
    expect(process).toHaveBeenCalledTimes(2);
    expect(decide).not.toHaveBeenCalled();
    expect(toolResults.map(record => record.isError)).toEqual([true, false, false]);
    const errors = result.messages.filter(message => message.type === "node_update" && message.node_id === "missing" && message.status === "error");
    expect(errors).toHaveLength(1);
    expect(processingMessageSchema.parse(errors[0])).toMatchObject({ type: "node_update", error_detail: { code: "missing_pack", missing_pack: missing.details } });
  });
  it.each(["thrown", "returned"])("preserves %s pack details and continues to the next control call without retry", async (boundary) => {
    const context = new ProcessingContext({ jobId: "control-pack", workflowId: null });
    const error = createMissingPackError("huggingface", ["huggingface.test.Missing"]);
    const dispatch = vi.fn(async (target: string) => {
      if (target === "missing") {
        if (boundary === "returned") {
          return { ...error.details };
        }
        throw new Error("control failed", { cause: error });
      }
      return { output: "continued" };
    });
    context.setSendControlEvent(dispatch);
    const tools = buildControlTools({
      missing: { node_type: "huggingface.test.Missing", node_title: "Missing" },
      available: { node_type: "test.Echo", node_title: "Echo" }
    });
    const missing = tools[0];
    const available = tools[1];
    if (!missing || !available) {
      throw new Error("Control fixture tools were not constructed");
    }
    expect(await missing.process(context, {})).toEqual({ ...error.details, status: "error", target_node_id: "missing" });
    expect(await available.process(context, {})).toEqual({ status: "completed", target_node_id: "available", result: { output: "continued" } });
    expect(dispatch.mock.calls.map(([target]) => target)).toEqual(["missing", "available"]);
  });
});
