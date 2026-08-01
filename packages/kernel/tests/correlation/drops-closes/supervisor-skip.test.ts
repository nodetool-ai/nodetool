/**
 * Supervisor `skip` against the correlation scheduler.
 *
 * Skipping is not "return without emitting". A correlated invocation that
 * simply produces nothing leaves siblings buffered against the skipped key at
 * every downstream join, and an invocation of an iteration node would have
 * opened child scopes an aggregate is waiting to see closed. Both halves are
 * tested here, on the shapes the plan names: the fan-out item that a join is
 * waiting on, and the iterator feeding an aggregate.
 *
 * See docs/workflow-supervisor-design.md §5.2.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  iterationOutput,
  aggregateOutput,
  singleOutput,
  dataEdge,
  foreachNode,
  collectNode
} from "../_harness.js";
import type { Escalation, Verdict } from "@nodetool-ai/protocol";
import type {
  DecisionOutcome,
  SupervisorHandle
} from "../../../src/supervisor.js";

class ScriptedHandle implements SupervisorHandle {
  readonly seen: Escalation[] = [];
  constructor(private readonly verdict: (e: Escalation) => Verdict) {}
  async decide(e: Escalation): Promise<DecisionOutcome> {
    this.seen.push(e);
    return { verdict: this.verdict(e), decidedBy: "agent" };
  }
  close(): void {}
}

describe("supervisor skip — the poisoned item in a fan-out", () => {
  it("lets an aggregate collapse over the items that survived", async () => {
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    const { result, captured } = await runWorkflow({
      jobId: "supervisor-skip-aggregate",
      supervisor: handle,
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: ["a", "poison", "c"] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "work",
          type: "test.Work",
          outputs: { value: "str" },
          output_correlation: { value: singleOutput("output") }
        },
        {
          id: "c",
          type: "nodetool.control.Collect",
          is_streaming_input: true,
          input_mode: "stream",
          outputs: { output: "list[any]" },
          output_correlation: { output: aggregateOutput("input_item") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "work", "output"),
        dataEdge("work", "value", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: {
        fe: foreachNode(),
        c: collectNode(),
        work: {
          async process(ins) {
            if (ins.output === "poison") throw new Error("item is bad");
            return { value: `ok:${ins.output}` };
          }
        }
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    expect(handle.seen).toHaveLength(1);
    // The escalation names the item, not just the node: the report has to be
    // able to say *which* of 200 items went missing.
    expect(handle.seen[0].invocationKey).toBe("fe:items=1");
    expect(handle.seen[0].inputs.output).toBe("poison");

    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual(["ok:a", "ok:c"]);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions![0].verdict.action).toBe("skip");
  });

  it("closes the scopes a skipped iterator invocation would have opened", async () => {
    // The skipped invocation is the iteration node itself, so it never mints
    // the child tokens its aggregate downstream is waiting on. `drop()` alone
    // signals `lineage_done` and would leave the aggregate hanging.
    const handle = new ScriptedHandle(() => ({ action: "skip" }));
    const { result, captured } = await runWorkflow({
      jobId: "supervisor-skip-scope-close",
      supervisor: handle,
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: [1, 2] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "c",
          type: "nodetool.control.Collect",
          is_streaming_input: true,
          input_mode: "stream",
          outputs: { output: "list[any]" },
          output_correlation: { output: aggregateOutput("input_item") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "c", "input_item"),
        dataEdge("c", "output", "sink", "value")
      ],
      executors: {
        fe: {
          async process() {
            return {};
          },
          async *genProcess() {
            throw new Error("iteration source failed");
          }
        },
        c: collectNode()
      },
      captureFrom: { sink: ["value"] }
    });

    expect(result.status).toBe("completed");
    expect(handle.seen[0].allowedActions).toContain("skip");
    // The aggregate finalized — empty, but finalized — instead of hanging on
    // a scope nobody would ever close.
    const envs = captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toEqual([]);
  });
});
