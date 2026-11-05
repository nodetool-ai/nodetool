import { afterEach, describe, expect, it, vi } from "vitest";
import { Graph, WorkflowRunner } from "@nodetool-ai/kernel";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { AppNode } from "../src/nodes/app.js";
import { streamInnerGraph } from "../src/nodes/run-inner-graph.js";

const options = { params: {}, jobPrefix: "test", failureLabel: "Test" };
const graph = { nodes: [], edges: [] };

function makeContext(): ProcessingContext {
  const context = new ProcessingContext({ jobId: "parent" });
  context.setResolveExecutor(() => ({
    async process() {
      return {};
    }
  }));
  return context;
}

afterEach(() => vi.restoreAllMocks());

describe("inner graph lifecycle", () => {
  it("preserves the App child's collected return value", async () => {
    vi.spyOn(WorkflowRunner.prototype, "run").mockResolvedValue({
      status: "completed",
      outputs: { answer: ["first", "second"] },
      messages: []
    });
    const app = new AppNode();
    app.app_json = { graph };
    expect(await app.genProcess(makeContext()).next()).toEqual({
      done: true,
      value: { answer: ["first", "second"] }
    });
  });

  it("does not start a child when the parent aborts during hydration", async () => {
    const context = makeContext();
    const controller = new AbortController();
    context.signal = controller.signal;
    context.setResolveNodeType(async () => null);
    const hydration = Promise.withResolvers<Graph>();
    const entered = Promise.withResolvers<void>();
    vi.spyOn(Graph, "loadFromDict").mockImplementation(() => {
      entered.resolve();
      return hydration.promise;
    });
    const run = vi.spyOn(WorkflowRunner.prototype, "run");
    const stream = streamInnerGraph(context, graph, options);
    const next = stream.next();
    await entered.promise;
    controller.abort();
    hydration.resolve(new Graph(graph));
    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels when the parent aborts while the child context is created", async () => {
    const context = makeContext();
    const controller = new AbortController();
    context.signal = controller.signal;
    const copy = context.copy.bind(context);
    vi.spyOn(context, "copy").mockImplementation((options) => {
      const child = copy(options);
      controller.abort();
      return child;
    });
    const cancel = vi.spyOn(WorkflowRunner.prototype, "cancel");
    const stream = streamInnerGraph(context, graph, options);
    await stream.next();
    expect(cancel).toHaveBeenCalled();
  });

  it.each(["return", "throw"] as const)(
    "closes an App child on consumer %s and accounts its cost",
    async (method) => {
      const context = makeContext();
      const child = context.copy({ inheritMessageListeners: false });
      vi.spyOn(context, "copy").mockReturnValue(child);
      const removeListener = vi.spyOn(context.signal, "removeEventListener");
      const result =
        Promise.withResolvers<Awaited<ReturnType<WorkflowRunner["run"]>>>();
      vi.spyOn(WorkflowRunner.prototype, "run").mockImplementation(() => {
        child.addToTotalCost(3);
        child.emit({
          type: "output_update",
          node_id: "out",
          node_name: "answer",
          output_name: "value",
          output_type: "str",
          metadata: {},
          value: "first"
        });
        return result.promise;
      });
      const cancel = vi
        .spyOn(WorkflowRunner.prototype, "cancel")
        .mockImplementation(() => {
          result.resolve({ status: "cancelled", outputs: {}, messages: [] });
        });
      const app = new AppNode();
      app.app_json = {
        graph: {
          nodes: [
            {
              id: "out",
              type: "nodetool.output.Output",
              properties: { name: "answer" }
            }
          ],
          edges: []
        }
      };
      const stream = app.genProcess(context);
      expect(await stream.next()).toEqual({
        done: false,
        value: { answer: "first" }
      });
      if (method === "return") {
        await stream.return(undefined);
      } else {
        await expect(
          stream.throw(new Error("consumer stopped"))
        ).rejects.toThrow("consumer stopped");
      }
      expect(cancel).toHaveBeenCalledOnce();
      expect(context.getTotalCost()).toBe(3);
      expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    }
  );
});
