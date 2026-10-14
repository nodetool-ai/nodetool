/**
 * Lineage links (`graph.links`) carry no value and imply no execution order.
 * A run must produce the same result with or without them, even when the
 * links point backwards or form a cycle.
 */

import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor, Edge, GraphLink } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "../src/actor.js";

const executor = (
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor => ({
  async process(inputs) {
    return fn(inputs);
  }
});

const nodes: NodeDescriptor[] = [
  { id: "input", type: "test.Input", name: "x" },
  {
    id: "upper",
    type: "test.Upper",
    outputs: { result: "string" },
    propertyTypes: { a: "string" }
  },
  { id: "output", type: "test.Output", name: "result" },
  { id: "note", type: "test.Note" }
];

const edges: Edge[] = [
  { source: "input", sourceHandle: "value", target: "upper", targetHandle: "a" },
  {
    source: "upper",
    sourceHandle: "result",
    target: "output",
    targetHandle: "value"
  }
];

const links: GraphLink[] = [
  { id: "1", source: "output", target: "input", label: "came from" },
  { id: "2", source: "input", target: "output" },
  { id: "3", source: "note", target: "upper", kind: "reference" },
  { id: "4", source: "upper", target: "note" }
];

async function run(withLinks: boolean) {
  const ran: string[] = [];
  const runner = new WorkflowRunner("job-links", {
    resolveExecutor: (node) => {
      ran.push(node.id);
      if (node.type === "test.Upper") {
        return executor((inputs) => ({
          result: String(inputs.a).toUpperCase()
        }));
      }
      if (node.type === "test.Output") {
        return executor((inputs) => ({ value: inputs.value }));
      }
      return executor(() => ({}));
    }
  });
  const result = await runner.run(
    { job_id: `job-links-${withLinks}`, params: { x: "shot" } },
    withLinks ? { nodes, edges, links } : { nodes, edges }
  );
  return { status: result.status, outputs: result.outputs, ran: ran.sort() };
}

describe("WorkflowRunner with lineage links", () => {
  it("returns the same result with and without links", async () => {
    const without = await run(false);
    const withLinks = await run(true);
    expect(without.status).toBe("completed");
    expect(without.outputs.result).toContain("SHOT");
    expect(withLinks).toEqual(without);
  });
});
