import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor, ProcessingMessage } from "@nodetool/protocol";
import {
  NodeInbox,
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

const getPrivateMessages = (runner: WorkflowRunner): ProcessingMessage[] =>
  (runner as unknown as { _messages: ProcessingMessage[] })._messages;

const getPrivateOutputValues = (
  runner: WorkflowRunner,
  name: string
): unknown[] | undefined =>
  (runner as unknown as { _outputs: Map<string, unknown[]> })._outputs.get(name);

const getPrivateInbox = (runner: WorkflowRunner, nodeId: string): NodeInbox =>
  (runner as unknown as { _inboxes: Map<string, NodeInbox> })._inboxes.get(
    nodeId
  )!;

describe("WorkflowRunner realtime primitives", () => {
  it("initializes a realtime graph without entering the normal run loop", async () => {
    const runner = new WorkflowRunner("rt-init", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime({ job_id: "rt-init" }, graph);

    expect(getPrivateMessages(runner)).toHaveLength(0);

    await expect(runner.pushInputValue("value", 42)).resolves.toBeUndefined();
    expect((getPrivateMessages(runner)[0] as { type: string }).type).toBe(
      "edge_update"
    );
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

    const messages = getPrivateMessages(runner);
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

    const outputs = getPrivateOutputValues(runner, "result");

    expect(outputs).toBeDefined();
    expect(outputs).toHaveLength(REALTIME_OUTPUT_BUFFER_LIMIT);
    expect(outputs?.[0]).toBe(10);
    expect(outputs?.at(-1)).toBe(REALTIME_OUTPUT_BUFFER_LIMIT + 9);
  });

  it("applies node-level input buffer policy during realtime initialization", async () => {
    const runner = new WorkflowRunner("rt-node-policy", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-node-policy" },
      {
        nodes: [
          { id: "input", type: "test.Input", name: "value" },
          {
            id: "buffered",
            type: "test.Buffered",
            inputBufferPolicy: {
              value: { capacity: 2, overflowPolicy: "drop_oldest" }
            }
          }
        ],
        edges: [
          {
            source: "input",
            sourceHandle: "value",
            target: "buffered",
            targetHandle: "value"
          }
        ]
      }
    );

    await runner.pushInputValue("value", 1);
    await runner.pushInputValue("value", 2);
    await runner.pushInputValue("value", 3);
    runner.finishInputStream("value");

    const inbox = getPrivateInbox(runner, "buffered");
    const values: unknown[] = [];
    for await (const value of inbox.iterInput("value")) {
      values.push(value);
    }

    expect(values).toEqual([2, 3]);
    expect(inbox.getDroppedCount("value")).toBe(1);
  });

  it("lets per-edge metadata override node-level input buffer policy", async () => {
    const runner = new WorkflowRunner("rt-edge-policy", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-edge-policy" },
      {
        nodes: [
          { id: "input", type: "test.Input", name: "value" },
          {
            id: "buffered",
            type: "test.Buffered",
            inputBufferPolicy: {
              value: { capacity: 2, overflowPolicy: "drop_oldest" }
            }
          }
        ],
        edges: [
          {
            source: "input",
            sourceHandle: "value",
            target: "buffered",
            targetHandle: "value",
            metadata: { capacity: 1, overflowPolicy: "drop_newest" }
          }
        ]
      }
    );

    await runner.pushInputValue("value", 1);
    await runner.pushInputValue("value", 2);
    await runner.pushInputValue("value", 3);
    runner.finishInputStream("value");

    const inbox = getPrivateInbox(runner, "buffered");
    const values: unknown[] = [];
    for await (const value of inbox.iterInput("value")) {
      values.push(value);
    }

    expect(values).toEqual([1]);
    expect(inbox.getDroppedCount("value")).toBe(2);
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
