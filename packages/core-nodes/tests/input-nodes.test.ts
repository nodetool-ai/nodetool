/**
 * Regression tests for input node dispatch:
 *  - Input nodes previously returned `{ value }` while declaring an `output`
 *    handle, and the runner pushed the raw property value to every outgoing
 *    edge without running process(). Transforming inputs (DocumentFileInput,
 *    StringInput max_length) therefore leaked raw values downstream.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import {
  DocumentFileInputNode,
  FloatInputNode,
  StringInputNode
} from "@nodetool-ai/core-nodes";
import { OutputNode } from "@nodetool-ai/audio-nodes";

describe("input node process() outputs", () => {
  it("StringInputNode emits the declared `output` handle and applies max_length", async () => {
    const node = new StringInputNode();
    node.assign({ value: "hello world", max_length: 5 });
    await expect(node.process()).resolves.toEqual({ output: "hello" });
  });

  it("FloatInputNode emits the declared `output` handle", async () => {
    const node = new FloatInputNode();
    node.assign({ value: 1.5 });
    await expect(node.process()).resolves.toEqual({ output: 1.5 });
  });

  it("DocumentFileInputNode builds a typed DocumentRef", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "/tmp/report.pdf" });
    await expect(node.process()).resolves.toEqual({
      document: { type: "document", uri: "file:///tmp/report.pdf" },
      path: "/tmp/report.pdf"
    });
  });
});

function makeRunner(): WorkflowRunner {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return new WorkflowRunner("input-dispatch", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        return {
          async process() {
            return {};
          }
        };
      }
      return registry.resolve(node);
    }
  });
}

async function runWorkflow(
  nodes: NodeDescriptor[],
  edges: Edge[],
  params: Record<string, unknown> = {}
) {
  return makeRunner().run(
    { job_id: `input-dispatch-${Date.now()}`, params },
    { nodes, edges }
  );
}

describe("input node dispatch through the runner", () => {
  it("routes the processed value (max_length applied) on the `output` handle", async () => {
    const result = await runWorkflow(
      [
        {
          id: "in",
          type: StringInputNode.nodeType,
          properties: { name: "text", value: "hello world", max_length: 5 }
        },
        { id: "out", type: OutputNode.nodeType, name: "sink" }
      ],
      [
        {
          source: "in",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.sink).toEqual(["hello"]);
  });

  it("routes per-handle outputs for DocumentFileInput (document vs path)", async () => {
    const result = await runWorkflow(
      [
        {
          id: "in",
          type: DocumentFileInputNode.nodeType,
          properties: { name: "doc", value: "/tmp/a.pdf" }
        },
        { id: "doc_out", type: OutputNode.nodeType, name: "doc_sink" },
        { id: "path_out", type: OutputNode.nodeType, name: "path_sink" }
      ],
      [
        {
          source: "in",
          sourceHandle: "document",
          target: "doc_out",
          targetHandle: "value"
        },
        {
          source: "in",
          sourceHandle: "path",
          target: "path_out",
          targetHandle: "value"
        }
      ]
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.doc_sink).toEqual([
      { type: "document", uri: "file:///tmp/a.pdf" }
    ]);
    expect(result.outputs.path_sink).toEqual(["/tmp/a.pdf"]);
  });

  it("runtime params override the stored property value", async () => {
    const result = await runWorkflow(
      [
        {
          id: "in",
          type: StringInputNode.nodeType,
          properties: { name: "text", value: "stored" }
        },
        { id: "out", type: OutputNode.nodeType, name: "sink" }
      ],
      [
        {
          source: "in",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ],
      { text: "runtime" }
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.sink).toEqual(["runtime"]);
  });
});
