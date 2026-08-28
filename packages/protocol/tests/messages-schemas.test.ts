/**
 * Zod-schema contract tests for `packages/protocol/src/messages.ts` (task B1).
 *
 * Validates that:
 *  1. A minimal valid sample of every major `ProcessingMessage` variant
 *     parses through both its per-type schema and the discriminated union.
 *  2. A sample with a wrong-typed field fails validation.
 *  3. An unknown `type` discriminator fails the discriminated union.
 *  4. The `is*` guard functions narrow correctly.
 */

import { describe, it, expect } from "vitest";
import {
  TaskUpdateEvent,
  processingMessageSchema,
  processingMessageSchemas,
  jobUpdateSchema,
  nodeUpdateSchema,
  generationCompleteSchema,
  nodeProgressSchema,
  edgeUpdateSchema,
  outputUpdateSchema,
  saveUpdateSchema,
  binaryUpdateSchema,
  logUpdateSchema,
  notificationSchema,
  errorMessageSchema,
  toolCallUpdateSchema,
  toolResultUpdateSchema,
  taskUpdateSchema,
  stepResultSchema,
  planningUpdateSchema,
  chunkSchema,
  predictionSchema,
  llmCallUpdateSchema,
  todoUpdateSchema,
  providerCostSchema,
  taskRefSchema,
  stepRefSchema,
  isJobUpdate,
  isNodeUpdate,
  isGenerationComplete,
  isNodeProgress,
  isEdgeUpdate,
  isOutputUpdate,
  isSaveUpdate,
  isBinaryUpdate,
  isLogUpdate,
  isNotification,
  isErrorMessage,
  isToolCallUpdate,
  isToolResultUpdate,
  isTaskUpdate,
  isStepResult,
  isPlanningUpdate,
  isChunk,
  isPrediction,
  isLLMCallUpdate,
  isTodoUpdate,
  isProcessingMessage,
  type MessageType
} from "../src/messages.js";

// ---------------------------------------------------------------------------
// Minimal valid samples of every major message type
// ---------------------------------------------------------------------------

const samples: Record<MessageType, unknown> = {
  job_update: {
    type: "job_update",
    status: "running",
    validation_issues: [
      { node_id: "n1", property: "prompt", message: "required" }
    ]
  },
  node_update: {
    type: "node_update",
    node_id: "n1",
    node_name: "Add",
    node_type: "math.Add",
    status: "running",
    provider_cost: {
      provider: "fal",
      amount: 0.02,
      unit: "USD"
    }
  },
  generation_complete: {
    type: "generation_complete",
    node_id: "n1",
    node_name: "Gen",
    node_type: "ns.Gen",
    outputs: { image: { type: "image", uri: "memory://x" } }
  },
  node_progress: {
    type: "node_progress",
    node_id: "n1",
    progress: 50,
    total: 100
  },
  edge_update: {
    type: "edge_update",
    workflow_id: "w1",
    edge_id: "e1",
    status: "active"
  },
  output_update: {
    type: "output_update",
    node_id: "n1",
    node_name: "Out",
    output_name: "result",
    value: 42,
    output_type: "int",
    metadata: {}
  },
  save_update: {
    type: "save_update",
    node_id: "n1",
    name: "file",
    value: "data",
    output_type: "str",
    metadata: {}
  },
  binary_update: {
    type: "binary_update",
    node_id: "n1",
    output_name: "img",
    binary: new Uint8Array([1, 2, 3])
  },
  log_update: {
    type: "log_update",
    node_id: "n1",
    node_name: "Add",
    content: "hello",
    severity: "info"
  },
  notification: {
    type: "notification",
    node_id: "n1",
    content: "done",
    severity: "warning"
  },
  error: { type: "error", message: "boom" },
  tool_call_update: {
    type: "tool_call_update",
    name: "search",
    args: { query: "hello" }
  },
  tool_result_update: {
    type: "tool_result_update",
    node_id: "n1",
    result: { answer: 42 }
  },
  task_update: {
    type: "task_update",
    task: { id: "t1", steps: [{ id: "s1", status: "running" }] },
    event: TaskUpdateEvent.TaskCreated
  },
  step_result: { type: "step_result", step: { id: "s1" }, result: "ok" },
  planning_update: {
    type: "planning_update",
    phase: "init",
    status: "started"
  },
  chunk: { type: "chunk", content: "hello", done: false },
  prediction: {
    type: "prediction",
    id: "p1",
    user_id: "u1",
    node_id: "n1",
    status: "completed",
    // provider-specific extra field, covered by `.catchall(z.unknown())`
    provider_response_id: "abc123"
  },
  llm_call: {
    type: "llm_call",
    node_id: "n1",
    provider: "openai",
    model: "gpt-4",
    messages: [{ role: "user", content: "hello" }],
    response: { text: "hi" },
    duration_ms: 100,
    timestamp: "2024-01-01T00:00:00Z"
  },
  todo_update: {
    type: "todo_update",
    todos: [{ content: "write tests", status: "in_progress" }]
  }
};

const schemasByType: Record<MessageType, (typeof processingMessageSchemas)[MessageType]> = {
  job_update: jobUpdateSchema,
  node_update: nodeUpdateSchema,
  generation_complete: generationCompleteSchema,
  node_progress: nodeProgressSchema,
  edge_update: edgeUpdateSchema,
  output_update: outputUpdateSchema,
  save_update: saveUpdateSchema,
  binary_update: binaryUpdateSchema,
  log_update: logUpdateSchema,
  notification: notificationSchema,
  error: errorMessageSchema,
  tool_call_update: toolCallUpdateSchema,
  tool_result_update: toolResultUpdateSchema,
  task_update: taskUpdateSchema,
  step_result: stepResultSchema,
  planning_update: planningUpdateSchema,
  chunk: chunkSchema,
  prediction: predictionSchema,
  llm_call: llmCallUpdateSchema,
  todo_update: todoUpdateSchema
};

describe("processingMessageSchema — valid samples", () => {
  for (const type of Object.keys(samples) as MessageType[]) {
    it(`accepts a minimal valid ${type} sample via its per-type schema`, () => {
      const result = schemasByType[type].safeParse(samples[type]);
      expect(result.success, JSON.stringify(result)).toBe(true);
    });

    it(`accepts a minimal valid ${type} sample via processingMessageSchema`, () => {
      const result = processingMessageSchema.safeParse(samples[type]);
      expect(result.success, JSON.stringify(result)).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(type);
      }
    });

    it(`accepts a minimal valid ${type} sample via processingMessageSchemas[type]`, () => {
      const result = processingMessageSchemas[type].safeParse(samples[type]);
      expect(result.success, JSON.stringify(result)).toBe(true);
    });
  }
});

describe("processingMessageSchema — wrong-typed field fails", () => {
  it("rejects job_update with a numeric status", () => {
    const bad = { type: "job_update", status: 42 };
    expect(jobUpdateSchema.safeParse(bad).success).toBe(false);
    expect(processingMessageSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects node_update missing required node_id", () => {
    const bad = {
      type: "node_update",
      node_name: "Add",
      node_type: "math.Add",
      status: "running"
    };
    expect(nodeUpdateSchema.safeParse(bad).success).toBe(false);
    expect(processingMessageSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects chunk with a non-string/Float32Array content", () => {
    const bad = { type: "chunk", content: 12345 };
    expect(chunkSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects log_update with an invalid severity", () => {
    const bad = {
      type: "log_update",
      node_id: "n1",
      node_name: "Add",
      content: "hello",
      severity: "critical"
    };
    expect(logUpdateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects binary_update whose binary is a plain array, not Uint8Array", () => {
    const bad = {
      type: "binary_update",
      node_id: "n1",
      output_name: "img",
      binary: [1, 2, 3]
    };
    expect(binaryUpdateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects todo_update with an invalid todo status", () => {
    const bad = {
      type: "todo_update",
      todos: [{ content: "x", status: "done" }]
    };
    expect(todoUpdateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("processingMessageSchema — unknown discriminator fails", () => {
  it("rejects an unrecognized type", () => {
    const result = processingMessageSchema.safeParse({
      type: "not_a_real_message_type",
      status: "running"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with no type field at all", () => {
    const result = processingMessageSchema.safeParse({ status: "running" });
    expect(result.success).toBe(false);
  });
});

describe("Chunk — Float32Array content", () => {
  it("accepts native Float32Array samples", () => {
    const msg = { type: "chunk", content: new Float32Array([0.1, 0.2, 0.3]) };
    const result = chunkSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBeInstanceOf(Float32Array);
    }
  });
});

describe("embedded schemas", () => {
  it("providerCostSchema accepts a minimal sample", () => {
    expect(
      providerCostSchema.safeParse({
        provider: "fal",
        amount: 0.5,
        unit: "USD"
      }).success
    ).toBe(true);
  });

  it("taskRefSchema accepts unknown extra keys (index signature)", () => {
    const result = taskRefSchema.safeParse({
      id: "t1",
      custom_field: { nested: true }
    });
    expect(result.success).toBe(true);
  });

  it("taskRefSchema accepts nested steps via stepRefSchema", () => {
    const result = taskRefSchema.safeParse({
      id: "t1",
      steps: [{ id: "s1", status: "completed", completed: true }]
    });
    expect(result.success).toBe(true);
  });

  it("stepRefSchema rejects a non-boolean completed field", () => {
    const result = stepRefSchema.safeParse({ id: "s1", completed: "yes" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

const guards: Record<MessageType, (value: unknown) => boolean> = {
  job_update: isJobUpdate,
  node_update: isNodeUpdate,
  generation_complete: isGenerationComplete,
  node_progress: isNodeProgress,
  edge_update: isEdgeUpdate,
  output_update: isOutputUpdate,
  save_update: isSaveUpdate,
  binary_update: isBinaryUpdate,
  log_update: isLogUpdate,
  notification: isNotification,
  error: isErrorMessage,
  tool_call_update: isToolCallUpdate,
  tool_result_update: isToolResultUpdate,
  task_update: isTaskUpdate,
  step_result: isStepResult,
  planning_update: isPlanningUpdate,
  chunk: isChunk,
  prediction: isPrediction,
  llm_call: isLLMCallUpdate,
  todo_update: isTodoUpdate
};

describe("is* guards narrow correctly", () => {
  for (const type of Object.keys(samples) as MessageType[]) {
    it(`${"is" + type} guard accepts a ${type} sample and rejects others`, () => {
      expect(guards[type](samples[type])).toBe(true);

      const otherType = (Object.keys(samples) as MessageType[]).find(
        (t) => t !== type
      )!;
      expect(guards[type](samples[otherType])).toBe(false);
    });
  }

  it("guards reject non-object values", () => {
    expect(isJobUpdate(null)).toBe(false);
    expect(isJobUpdate(undefined)).toBe(false);
    expect(isJobUpdate("job_update")).toBe(false);
    expect(isJobUpdate(42)).toBe(false);
  });

  it("isProcessingMessage validates full structural shape, not just discriminant", () => {
    // Right `type`, wrong field type → guard-by-discriminant would say yes,
    // but full structural validation must say no.
    expect(isJobUpdate({ type: "job_update", status: 42 })).toBe(true);
    expect(isProcessingMessage({ type: "job_update", status: 42 })).toBe(
      false
    );
    expect(isProcessingMessage(samples.job_update)).toBe(true);
  });
});
