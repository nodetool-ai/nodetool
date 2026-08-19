/**
 * Code node console.* → log_update. Guest console.log/warn/error/info must
 * reach the editor's log panel as they happen, not only after the run.
 */
import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

function stubContext(): {
  context: ProcessingContext;
  messages: Record<string, unknown>[];
} {
  const messages: Record<string, unknown>[] = [];
  const context = {
    workflowId: "wf-test",
    postMessage: (message: Record<string, unknown>) => {
      messages.push(message);
    }
  } as unknown as ProcessingContext;
  return { context, messages };
}

function logsOf(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  return messages.filter((message) => message.type === "log_update");
}

describe("CodeNode — console log updates", () => {
  it("posts console.log/warn/error/info as log_update on process", async () => {
    const { context, messages } = stubContext();
    const node = new CodeNode({
      code: `
        console.log("hello", 2);
        console.info("note");
        console.warn("careful");
        console.error("boom");
        return { ok: true };
      `,
      __node_id: "n1"
    });
    const result = await node.process(context);
    expect(result).toEqual({ ok: true });
    expect(logsOf(messages)).toEqual([
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "hello 2",
        severity: "info",
        workflow_id: "wf-test"
      },
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "note",
        severity: "info",
        workflow_id: "wf-test"
      },
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "careful",
        severity: "warning",
        workflow_id: "wf-test"
      },
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "boom",
        severity: "error",
        workflow_id: "wf-test"
      }
    ]);
  });

  it("posts console.log during an emit/output run", async () => {
    const { context, messages } = stubContext();
    const node = new CodeNode({
      code: `
        console.log("before");
        await emit("out", 1);
        console.log("after");
        await output("done", true);
      `,
      __node_id: "n1"
    });
    const bags: Record<string, unknown>[] = [];
    for await (const bag of node.genProcess(context)) {
      bags.push(bag);
    }
    expect(bags).toEqual([{ out: 1 }, { done: true }]);
    expect(logsOf(messages)).toEqual([
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "before",
        severity: "info",
        workflow_id: "wf-test"
      },
      {
        type: "log_update",
        node_id: "n1",
        node_name: "Code",
        content: "after",
        severity: "info",
        workflow_id: "wf-test"
      }
    ]);
  });

  it("does not post logs without a node id", async () => {
    const { context, messages } = stubContext();
    const node = new CodeNode({
      code: `console.log("hello"); return { ok: true };`
    });
    await node.process(context);
    expect(logsOf(messages)).toEqual([]);
  });
});
