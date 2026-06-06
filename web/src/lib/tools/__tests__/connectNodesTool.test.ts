/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";

jest.mock("../../../utils/handleUtils", () => ({
  findOutputHandle: jest.fn(),
  findInputHandle: jest.fn(),
  getAllOutputHandles: jest.fn().mockReturnValue([]),
  getAllInputHandles: jest.fn().mockReturnValue([]),
}));

jest.mock("../../../utils/TypeHandler", () => ({
  isConnectable: jest.fn().mockReturnValue(true),
}));

jest.mock("../../../utils/graphCycle", () => ({
  wouldCreateCycle: jest.fn().mockReturnValue(false),
}));

const mockGetMetadata = jest.fn();
jest.mock("../../../stores/MetadataStore", () => {
  const storeState = {
    metadata: {},
    getMetadata: mockGetMetadata,
  };
  const store = {
    getState: () => storeState,
  };
  return { __esModule: true, default: store };
});

import { findOutputHandle, findInputHandle } from "../../../utils/handleUtils";
import { isConnectable } from "../../../utils/TypeHandler";
import { wouldCreateCycle } from "../../../utils/graphCycle";

import "../builtin/connectNodes";

const mockedFindOutputHandle = findOutputHandle as jest.Mock;
const mockedFindInputHandle = findInputHandle as jest.Mock;
const mockedIsConnectable = isConnectable as jest.Mock;
const mockedWouldCreateCycle = wouldCreateCycle as jest.Mock;

function createMockNodeStore(
  nodes: Array<{ id: string; type?: string }>,
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }> = []
) {
  let edgeCounter = edges.length;
  const storeState = {
    nodes,
    edges,
    findNode: (id: string) => nodes.find((n) => n.id === id),
    generateEdgeId: jest.fn(() => `edge-${++edgeCounter}`),
    addEdge: jest.fn((edge: unknown) => edges.push(edge as never)),
  };
  return {
    getState: () => storeState,
  };
}

function createMockState(
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState {
  return {
    nodeMetadata: {},
    currentWorkflowId: "wf-1",
    getWorkflow: jest.fn(),
    addWorkflow: jest.fn(),
    removeWorkflow: jest.fn(),
    getNodeStore: jest.fn(),
    updateWorkflow: jest.fn(),
    saveWorkflow: jest.fn(),
    getCurrentWorkflow: jest.fn(),
    setCurrentWorkflowId: jest.fn(),
    fetchWorkflow: jest.fn(),
    newWorkflow: jest.fn() as unknown as () => ReturnType<FrontendToolState["newWorkflow"]>,
    createNew: jest.fn(),
    searchTemplates: jest.fn(),
    copy: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFindOutputHandle.mockReturnValue({ name: "output", type: { type: "str" } });
  mockedFindInputHandle.mockReturnValue({ name: "input", type: { type: "str" } });
  mockedIsConnectable.mockReturnValue(true);
  mockedWouldCreateCycle.mockReturnValue(false);
  mockGetMetadata.mockReturnValue({
    properties: [],
    outputs: [{ name: "output", type: { type: "str" } }],
  });
});

describe("ui_connect_nodes tool", () => {
  it("connects two nodes successfully", async () => {
    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_connect_nodes",
      {
        source_node_id: "n1",
        source_handle: "output",
        target_node_id: "n2",
        target_handle: "input",
      },
      "tc-1",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; edge_id: string };
    expect(typed.ok).toBe(true);
    expect(typed.edge_id).toBeDefined();
    expect(store.getState().addEdge).toHaveBeenCalled();
  });

  it("returns existing edge without creating duplicate", async () => {
    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const existingEdges = [
      { id: "e-existing", source: "n1", target: "n2", sourceHandle: "output", targetHandle: "input" },
    ];
    const store = createMockNodeStore(nodes, existingEdges);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_connect_nodes",
      {
        source_node_id: "n1",
        source_handle: "output",
        target_node_id: "n2",
        target_handle: "input",
      },
      "tc-2",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; edge_id: string; note: string };
    expect(typed.ok).toBe(true);
    expect(typed.edge_id).toBe("e-existing");
    expect(typed.note).toContain("already exists");
    expect(store.getState().addEdge).not.toHaveBeenCalled();
  });

  it("throws when source node is not found", async () => {
    const nodes = [{ id: "n2", type: "test.Target" }];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "missing",
          source_handle: "output",
          target_node_id: "n2",
          target_handle: "input",
        },
        "tc-3",
        { getState: () => state }
      )
    ).rejects.toThrow("Source node not found: missing");
  });

  it("throws when target node is not found", async () => {
    const nodes = [{ id: "n1", type: "test.Source" }];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "n1",
          source_handle: "output",
          target_node_id: "missing",
          target_handle: "input",
        },
        "tc-4",
        { getState: () => state }
      )
    ).rejects.toThrow("Target node not found: missing");
  });

  it("throws when connection would create a cycle", async () => {
    mockedWouldCreateCycle.mockReturnValue(true);

    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "n1",
          source_handle: "output",
          target_node_id: "n2",
          target_handle: "input",
        },
        "tc-5",
        { getState: () => state }
      )
    ).rejects.toThrow(/would create a cycle/);
  });

  it("throws when types are not connectable", async () => {
    mockedIsConnectable.mockReturnValue(false);

    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "n1",
          source_handle: "output",
          target_node_id: "n2",
          target_handle: "input",
        },
        "tc-6",
        { getState: () => state }
      )
    ).rejects.toThrow(/Type mismatch/);
  });

  it("throws when source handle is not found", async () => {
    mockedFindOutputHandle.mockReturnValue(null);

    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "n1",
          source_handle: "bad_output",
          target_node_id: "n2",
          target_handle: "input",
        },
        "tc-7",
        { getState: () => state }
      )
    ).rejects.toThrow(/Source handle 'bad_output' not found/);
  });

  it("throws when target handle is not found", async () => {
    mockedFindInputHandle.mockReturnValue(null);

    const nodes = [
      { id: "n1", type: "test.Source" },
      { id: "n2", type: "test.Target" },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_connect_nodes",
        {
          source_node_id: "n1",
          source_handle: "output",
          target_node_id: "n2",
          target_handle: "bad_input",
        },
        "tc-8",
        { getState: () => state }
      )
    ).rejects.toThrow(/Target handle 'bad_input' not found/);
  });
});
