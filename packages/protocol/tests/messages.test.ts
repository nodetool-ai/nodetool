/**
 * Contract tests for protocol message types.
 *
 * Validates that:
 *  1. Every message type has a unique `type` discriminator.
 *  2. Factory helpers produce valid payloads.
 *  3. The discriminated union can be narrowed correctly at runtime.
 */

import { describe, it, expect } from "vitest";
import type {
  ProcessingMessage,
  MessageType,
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  EdgeUpdate,
  OutputUpdate,
  PreviewUpdate,
  SaveUpdate,
  BinaryUpdate,
  LogUpdate,
  Notification,
  ErrorMessage,
  ToolCallUpdate,
  ToolResultUpdate,
  TaskUpdate,
  StepResult,
  PlanningUpdate,
  Chunk,
  Prediction,
} from "../src/messages.js";
import {
  TaskUpdateEvent,
  sanitizeMemoryUris,
  encodeBinaryUpdate,
} from "../src/messages.js";

// ---------------------------------------------------------------------------
// Helpers: minimal valid instances of each message type
// ---------------------------------------------------------------------------

function jobUpdate(): JobUpdate {
  return { type: "job_update", status: "running" };
}
function nodeUpdate(): NodeUpdate {
  return {
    type: "node_update",
    node_id: "n1",
    node_name: "Add",
    node_type: "math.Add",
    status: "running",
  };
}
function nodeProgress(): NodeProgress {
  return { type: "node_progress", node_id: "n1", progress: 50, total: 100 };
}
function edgeUpdate(): EdgeUpdate {
  return {
    type: "edge_update",
    workflow_id: "w1",
    edge_id: "e1",
    status: "active",
  };
}
function outputUpdate(): OutputUpdate {
  return {
    type: "output_update",
    node_id: "n1",
    node_name: "Out",
    output_name: "result",
    value: 42,
    output_type: "int",
    metadata: {},
  };
}
function previewUpdate(): PreviewUpdate {
  return { type: "preview_update", node_id: "n1", value: "preview data" };
}
function saveUpdate(): SaveUpdate {
  return {
    type: "save_update",
    node_id: "n1",
    name: "file",
    value: "data",
    output_type: "str",
    metadata: {},
  };
}
function binaryUpdate(): BinaryUpdate {
  return {
    type: "binary_update",
    node_id: "n1",
    output_name: "img",
    binary: new Uint8Array([1, 2, 3]),
  };
}
function logUpdate(): LogUpdate {
  return {
    type: "log_update",
    node_id: "n1",
    node_name: "Add",
    content: "hello",
    severity: "info",
  };
}
function notification(): Notification {
  return {
    type: "notification",
    node_id: "n1",
    content: "done",
    severity: "info",
  };
}
function errorMsg(): ErrorMessage {
  return { type: "error", message: "boom" };
}
function toolCallUpdate(): ToolCallUpdate {
  return {
    type: "tool_call_update",
    name: "search",
    args: { query: "hello" },
  };
}
function toolResultUpdate(): ToolResultUpdate {
  return {
    type: "tool_result_update",
    node_id: "n1",
    result: { answer: 42 },
  };
}
function taskUpdate(): TaskUpdate {
  return {
    type: "task_update",
    task: {},
    event: TaskUpdateEvent.TaskCreated,
  };
}
function stepResult(): StepResult {
  return { type: "step_result", step: {}, result: "ok" };
}
function planningUpdate(): PlanningUpdate {
  return {
    type: "planning_update",
    phase: "init",
    status: "started",
  };
}
function chunk(): Chunk {
  return { type: "chunk", content: "hello", done: false };
}
function prediction(): Prediction {
  return {
    type: "prediction",
    id: "p1",
    user_id: "u1",
    node_id: "n1",
    status: "completed",
  };
}

// ---------------------------------------------------------------------------
// Collect all factory functions so we can iterate over them
// ---------------------------------------------------------------------------

const factories: Array<[MessageType, () => ProcessingMessage]> = [
  ["job_update", jobUpdate],
  ["node_update", nodeUpdate],
  ["node_progress", nodeProgress],
  ["edge_update", edgeUpdate],
  ["output_update", outputUpdate],
  ["preview_update", previewUpdate],
  ["save_update", saveUpdate],
  ["binary_update", binaryUpdate],
  ["log_update", logUpdate],
  ["notification", notification],
  ["error", errorMsg],
  ["tool_call_update", toolCallUpdate],
  ["tool_result_update", toolResultUpdate],
  ["task_update", taskUpdate],
  ["step_result", stepResult],
  ["planning_update", planningUpdate],
  ["chunk", chunk],
  ["prediction", prediction],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProcessingMessage discriminator", () => {
  it("every variant has the expected `type` field", () => {
    for (const [expectedType, factory] of factories) {
      const msg = factory();
      expect(msg.type).toBe(expectedType);
    }
  });

  it("all discriminator values are unique", () => {
    const types = factories.map(([t]) => t);
    expect(new Set(types).size).toBe(types.length);
  });

  it("has exactly 18 message types matching Python ProcessingMessage", () => {
    expect(factories.length).toBe(18);
  });
});

describe("runtime narrowing via type field", () => {
  it("narrows JobUpdate correctly", () => {
    const msg: ProcessingMessage = jobUpdate();
    if (msg.type === "job_update") {
      // TypeScript narrows to JobUpdate here
      expect(msg.status).toBe("running");
    } else {
      throw new Error("narrowing failed");
    }
  });

  it("narrows NodeUpdate correctly", () => {
    const msg: ProcessingMessage = nodeUpdate();
    if (msg.type === "node_update") {
      expect(msg.node_id).toBe("n1");
      expect(msg.node_name).toBe("Add");
    } else {
      throw new Error("narrowing failed");
    }
  });

  it("narrows OutputUpdate correctly", () => {
    const msg: ProcessingMessage = outputUpdate();
    if (msg.type === "output_update") {
      expect(msg.value).toBe(42);
      expect(msg.output_type).toBe("int");
    } else {
      throw new Error("narrowing failed");
    }
  });
});

describe("TaskUpdateEvent enum", () => {
  it("has all expected values", () => {
    expect(TaskUpdateEvent.TaskCreated).toBe("task_created");
    expect(TaskUpdateEvent.StepStarted).toBe("step_started");
    expect(TaskUpdateEvent.EnteredConclusionStage).toBe(
      "entered_conclusion_stage"
    );
    expect(TaskUpdateEvent.StepCompleted).toBe("step_completed");
    expect(TaskUpdateEvent.StepFailed).toBe("step_failed");
    expect(TaskUpdateEvent.TaskCompleted).toBe("task_completed");
  });
});

describe("optional fields default correctly", () => {
  it("JobUpdate minimal payload", () => {
    const msg = jobUpdate();
    expect(msg.job_id).toBeUndefined();
    expect(msg.workflow_id).toBeUndefined();
    expect(msg.error).toBeUndefined();
    expect(msg.run_state).toBeUndefined();
  });

  it("Chunk minimal payload", () => {
    const msg = chunk();
    expect(msg.node_id).toBeUndefined();
    expect(msg.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeMemoryUris
// ---------------------------------------------------------------------------

describe("sanitizeMemoryUris", () => {
  it("returns primitive strings unchanged", () => {
    expect(sanitizeMemoryUris("hello world")).toBe("hello world");
    expect(sanitizeMemoryUris("")).toBe("");
    expect(sanitizeMemoryUris("https://example.com")).toBe(
      "https://example.com"
    );
  });

  it("replaces memory:// prefixed strings with empty string", () => {
    expect(sanitizeMemoryUris("memory://some/path")).toBe("");
    expect(sanitizeMemoryUris("memory://")).toBe("");
    expect(sanitizeMemoryUris("memory://abc/def/ghi")).toBe("");
  });

  it("recursively sanitizes arrays", () => {
    const input = ["keep", "memory://remove", "also keep"];
    expect(sanitizeMemoryUris(input)).toEqual(["keep", "", "also keep"]);
  });

  it("recursively sanitizes nested objects", () => {
    const input = {
      a: "memory://foo",
      b: "safe",
      nested: { c: "memory://bar", d: "ok" },
    };
    expect(sanitizeMemoryUris(input)).toEqual({
      a: "",
      b: "safe",
      nested: { c: "", d: "ok" },
    });
  });

  it("handles mixed nesting (objects with arrays containing memory URIs)", () => {
    const input = {
      items: ["memory://x", "y"],
      deep: { list: [{ uri: "memory://z" }, { uri: "keep" }] },
    };
    expect(sanitizeMemoryUris(input)).toEqual({
      items: ["", "y"],
      deep: { list: [{ uri: "" }, { uri: "keep" }] },
    });
  });

  it("returns non-string primitives (numbers, booleans, null) unchanged", () => {
    expect(sanitizeMemoryUris(42)).toBe(42);
    expect(sanitizeMemoryUris(true)).toBe(true);
    expect(sanitizeMemoryUris(false)).toBe(false);
    expect(sanitizeMemoryUris(null)).toBe(null);
    expect(sanitizeMemoryUris(undefined)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// encodeBinaryUpdate
// ---------------------------------------------------------------------------

describe("encodeBinaryUpdate", () => {
  it("encodes a BinaryUpdate with correct format: JSON header + null byte + raw binary", () => {
    const update: BinaryUpdate = {
      type: "binary_update",
      node_id: "n1",
      output_name: "img",
      binary: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    };
    const encoded = encodeBinaryUpdate(update);

    // Find null byte separator
    const nullIdx = encoded.indexOf(0);
    expect(nullIdx).toBeGreaterThan(0);

    // Header before null byte should be valid JSON
    const headerStr = new TextDecoder().decode(encoded.slice(0, nullIdx));
    const header = JSON.parse(headerStr);
    expect(header).toEqual({
      type: "binary_update",
      node_id: "n1",
      output_name: "img",
    });

    // Binary payload after null byte should match original
    const payload = encoded.slice(nullIdx + 1);
    expect(payload).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("JSON header contains type, node_id, output_name", () => {
    const update: BinaryUpdate = {
      type: "binary_update",
      node_id: "node-42",
      output_name: "audio_out",
      binary: new Uint8Array([1]),
    };
    const encoded = encodeBinaryUpdate(update);
    const nullIdx = encoded.indexOf(0);
    const header = JSON.parse(
      new TextDecoder().decode(encoded.slice(0, nullIdx))
    );

    expect(Object.keys(header).sort()).toEqual([
      "node_id",
      "output_name",
      "type",
    ]);
    expect(header.type).toBe("binary_update");
    expect(header.node_id).toBe("node-42");
    expect(header.output_name).toBe("audio_out");
  });

  it("binary payload is preserved exactly", () => {
    const binaryData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) binaryData[i] = i;

    const update: BinaryUpdate = {
      type: "binary_update",
      node_id: "n",
      output_name: "o",
      binary: binaryData,
    };
    const encoded = encodeBinaryUpdate(update);
    const nullIdx = encoded.indexOf(0);
    const payload = encoded.slice(nullIdx + 1);
    expect(payload).toEqual(binaryData);
  });

  it("works with empty binary payload", () => {
    const update: BinaryUpdate = {
      type: "binary_update",
      node_id: "n1",
      output_name: "empty",
      binary: new Uint8Array(0),
    };
    const encoded = encodeBinaryUpdate(update);
    const nullIdx = encoded.indexOf(0);

    // Header should still be valid
    const header = JSON.parse(
      new TextDecoder().decode(encoded.slice(0, nullIdx))
    );
    expect(header.node_id).toBe("n1");

    // Nothing after the null byte
    const payload = encoded.slice(nullIdx + 1);
    expect(payload.length).toBe(0);
  });
});
