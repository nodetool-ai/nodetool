import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor, ProcessingMessage } from "@nodetool/protocol";
import {
  RealtimeRunner,
  REALTIME_MESSAGE_BUFFER_LIMIT,
  REALTIME_OUTPUT_BUFFER_LIMIT,
  WorkflowRunner
} from "../src/index.js";
import type { NodeExecutor } from "../src/actor.js";

const simpleExecutor = (
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor => ({
  async process(inputs) {
    return fn(inputs);
  }
});

const graph: { nodes: NodeDescriptor[]; edges: Edge[] } = {
  nodes: [
    { id: "input", type: "test.Input", name: "value" },
    { id: "output", type: "test.Output", name: "result" }
  ],
  edges: [
    {
      source: "input",
      sourceHandle: "value",
      target: "output",
      targetHandle: "value"
    }
  ]
};

describe("WorkflowRunner realtime primitives", () => {
  it("initializes a realtime graph without entering the normal run loop", async () => {
    const runner = new WorkflowRunner("rt-init", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime({ job_id: "rt-init" }, graph);

    expect(((runner as unknown as { _messages: ProcessingMessage[] })._messages)).toHaveLength(
      0
    );

    await expect(runner.pushInputValue("value", 42)).resolves.toBeUndefined();
    expect(
      ((runner as unknown as { _messages: ProcessingMessage[] })._messages[0] as {
        type: string;
      }).type
    ).toBe("edge_update");
  });

  it("bounds the realtime message buffer", () => {
    const runner = new WorkflowRunner("rt-messages", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    const emit = (
      runner as unknown as { _emit: (message: ProcessingMessage) => void }
    )._emit.bind(runner);

    for (let index = 0; index < REALTIME_MESSAGE_BUFFER_LIMIT + 25; index += 1) {
      emit({
        type: "job_update",
        status: "running",
        job_id: `job-${index}`,
        workflow_id: null
      });
    }

    const messages = (
      runner as unknown as { _messages: ProcessingMessage[] }
    )._messages;
    expect(messages).toHaveLength(REALTIME_MESSAGE_BUFFER_LIMIT);
    expect((messages.at(0) as { job_id: string }).job_id).toBe("job-25");
    expect((messages.at(-1) as { job_id: string }).job_id).toBe(
      `job-${REALTIME_MESSAGE_BUFFER_LIMIT + 24}`
    );
  });

  it("bounds collected realtime output values", () => {
    const runner = new WorkflowRunner("rt-outputs", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    const appendOutputValue = (
      runner as unknown as {
        _appendOutputValue: (name: string, value: unknown) => void;
      }
    )._appendOutputValue.bind(runner);

    for (let index = 0; index < REALTIME_OUTPUT_BUFFER_LIMIT + 10; index += 1) {
      appendOutputValue("result", index);
    }

    const outputs = (
      runner as unknown as { _outputs: Map<string, unknown[]> }
    )._outputs.get("result");

    expect(outputs).toBeDefined();
    expect(outputs).toHaveLength(REALTIME_OUTPUT_BUFFER_LIMIT);
    expect(outputs?.[0]).toBe(10);
    expect(outputs?.at(-1)).toBe(REALTIME_OUTPUT_BUFFER_LIMIT + 9);
  });
});

describe("RealtimeRunner skeleton", () => {
  it("composes a WorkflowRunner configured for realtime mode", async () => {
    const realtimeRunner = new RealtimeRunner("rt-shell", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await realtimeRunner.startRealtimeMode({ job_id: "rt-shell" }, graph);

    expect(realtimeRunner.runner).toBeInstanceOf(WorkflowRunner);
    expect(
      (
        realtimeRunner.runner as unknown as {
          _options: { runMode?: "one_shot" | "realtime" };
        }
      )._options.runMode
    ).toBe("realtime");
  });

  it("exposes explicit stubs for stopRealtimeMode and pushParameter", async () => {
    const realtimeRunner = new RealtimeRunner("rt-stubs", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await expect(realtimeRunner.stopRealtimeMode()).rejects.toThrow(
      "RealtimeRunner.stopRealtimeMode is not implemented yet"
    );
    await expect(realtimeRunner.pushParameter("strength", 0.5)).rejects.toThrow(
      "RealtimeRunner.pushParameter is not implemented yet"
    );
  });
});
