import { normalizeOutputUpdateValue } from "../outputUpdateValue";
import type { Chunk, OutputUpdate, WorkflowAttributes } from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import { handleUpdate, mergeNodeUpdateProperties } from "../workflowUpdates";

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    addNotification: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

beforeEach(() => {
  useResultsStore.setState({
    results: {},
    outputResults: {},
    progress: {},
    edges: {},
    chunks: {},
    tasks: {},
    toolCalls: {},
    planningUpdates: {},
    previews: {}
  });
  mockRunnerStore.setState.mockClear();
});

describe("normalizeOutputUpdateValue", () => {
  it("wraps raw image output values with their media type", () => {
    const rawValue = { data: [1, 2, 3] };
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-1",
      node_name: "Image Node",
      output_name: "image",
      output_type: "image",
      value: rawValue,
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toEqual({
      type: "image",
      data: [1, 2, 3]
    });
  });

  it("preserves values that already declare their own type", () => {
    const typedValue = { type: "image", data: [1, 2, 3] };
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-1",
      node_name: "Image Node",
      output_name: "image",
      output_type: "image",
      value: typedValue,
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toBe(typedValue);
  });

  it("leaves non-media outputs unchanged", () => {
    const update: OutputUpdate = {
      type: "output_update",
      node_id: "node-2",
      node_name: "Text Node",
      output_name: "output",
      output_type: "string",
      value: "hello",
      metadata: {}
    };

    expect(normalizeOutputUpdateValue(update)).toBe("hello");
  });
});

describe("handleUpdate", () => {
  it("stores workflow chunk updates by node id", () => {
    const chunk: Chunk = {
      type: "chunk",
      node_id: "node-1",
      workflow_id: "workflow-1",
      content_type: "text",
      content: "hello"
    };

    handleUpdate(
      mockWorkflow,
      chunk,
      mockRunnerStore as never,
      () => undefined
    );

    expect(useResultsStore.getState().getChunk("workflow-1", "node-1")).toBe(
      "hello"
    );
  });

  it("ignores workflow chunk updates without node id", () => {
    const chunk: Chunk = {
      type: "chunk",
      workflow_id: "workflow-1",
      content_type: "text",
      content: "done",
      done: true
    };

    handleUpdate(
      mockWorkflow,
      chunk,
      mockRunnerStore as never,
      () => undefined
    );

    expect(useResultsStore.getState().getChunk("workflow-1", "node-1")).toBeUndefined();
  });
});

describe("mergeNodeUpdateProperties", () => {
  it("preserves existing static properties when node_update contains stale values", () => {
    const merged = mergeNodeUpdateProperties({
      updateProperties: { prompt: "stale prompt", temperature: 0.9 },
      existingStatic: { prompt: "edited prompt", temperature: 0.2 },
      existingDynamic: {},
      isDynamicSchemaNode: false
    });

    expect(merged.staticProperties).toEqual({
      prompt: "edited prompt",
      temperature: 0.2
    });
  });

  it("adds static properties that do not already exist", () => {
    const merged = mergeNodeUpdateProperties({
      updateProperties: { seed: 42 },
      existingStatic: { prompt: "edited prompt" },
      existingDynamic: {},
      isDynamicSchemaNode: false
    });

    expect(merged.staticProperties).toEqual({
      prompt: "edited prompt",
      seed: 42
    });
  });

  it("skips dynamic overwrites for dynamic schema nodes", () => {
    const merged = mergeNodeUpdateProperties({
      updateProperties: { prompt: "stale dynamic value" },
      existingStatic: {},
      existingDynamic: { prompt: "edited dynamic value" },
      isDynamicSchemaNode: true
    });

    expect(merged.dynamicProperties).toEqual({
      prompt: "edited dynamic value"
    });
  });
});
