import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import type { Workflow, WorkflowList, NodeMetadata } from "../../../../stores/ApiTypes";

jest.mock("@nodetool-ai/protocol", () => ({
  uiSearchNodesParams: {
    query: jest.requireActual("zod").z.string(),
    input_type: jest.requireActual("zod").z.string().optional(),
    output_type: jest.requireActual("zod").z.string().optional(),
    limit: jest.requireActual("zod").z.number().optional()
  }
}));

const mockSearchResults = jest.fn().mockReturnValue({ sortedResults: [] });
jest.mock("../../../../utils/nodeSearch", () => ({
  computeSearchResults: (...args: unknown[]) => mockSearchResults(...args)
}));

import "../searchNodes";

interface SearchResult {
  ok: boolean;
  query: string;
  count: number;
  total_matches: number;
  results: Array<Record<string, unknown>>;
}

function makeMockState(
  overrides?: Partial<FrontendToolState>
): FrontendToolState {
  return {
    nodeMetadata: {},
    currentWorkflowId: null,
    getWorkflow: jest.fn(() => undefined),
    addWorkflow: jest.fn(),
    removeWorkflow: jest.fn(),
    getNodeStore: jest.fn(() => undefined),
    updateWorkflow: jest.fn(),
    saveWorkflow: jest.fn(async () => {}),
    getCurrentWorkflow: jest.fn(() => undefined),
    setCurrentWorkflowId: jest.fn(),
    fetchWorkflow: jest.fn(async () => {}),
    newWorkflow: jest.fn(() => ({}) as Workflow),
    createNew: jest.fn(async () => ({}) as Workflow),
    searchTemplates: jest.fn(
      async () => ({ workflows: [], next: null }) as WorkflowList
    ),
    copy: jest.fn(async () => ({}) as Workflow),
    ...overrides
  };
}

function makeCtx(state: FrontendToolState) {
  return { getState: () => state };
}

function makeNode(overrides: Partial<NodeMetadata>): NodeMetadata {
  return {
    node_type: "nodetool.test.Node",
    title: "Test Node",
    namespace: "nodetool.test",
    properties: [],
    outputs: [],
    ...overrides
  } as NodeMetadata;
}

describe("ui_search_nodes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns search results with basic fields", async () => {
    const node = makeNode({
      node_type: "nodetool.text.Concat",
      title: "Concat",
      namespace: "nodetool.text"
    });
    mockSearchResults.mockReturnValueOnce({ sortedResults: [node] });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "concat" },
      "call-1",
      ctx
    )) as SearchResult;

    expect(result).toMatchObject({
      ok: true,
      query: "concat",
      count: 1,
      total_matches: 1
    });
    expect(result.results[0]).toEqual({
      node_type: "nodetool.text.Concat",
      title: "Concat",
      namespace: "nodetool.text"
    });
  });

  it("includes properties when include_properties is true", async () => {
    const node = makeNode({
      node_type: "nodetool.text.Format",
      title: "Format",
      namespace: "nodetool.text",
      properties: [
        { name: "template", type: { type: "str" }, required: true }
      ] as NodeMetadata["properties"]
    });
    mockSearchResults.mockReturnValueOnce({ sortedResults: [node] });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "format", include_properties: true },
      "call-2",
      ctx
    )) as SearchResult;

    expect(result.results[0].properties).toEqual([
      { name: "template", type: { type: "str" }, required: true }
    ]);
    expect(result.results[0].input_handles).toEqual([
      { name: "template", type: { type: "str" } }
    ]);
  });

  it("includes outputs when include_outputs is true", async () => {
    const node = makeNode({
      node_type: "nodetool.text.Concat",
      title: "Concat",
      namespace: "nodetool.text",
      outputs: [
        { name: "result", type: { type: "str" }, stream: false }
      ] as NodeMetadata["outputs"]
    });
    mockSearchResults.mockReturnValueOnce({ sortedResults: [node] });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "concat", include_outputs: true },
      "call-3",
      ctx
    )) as SearchResult;

    expect(result.results[0].outputs).toEqual([
      { name: "result", type: { type: "str" }, stream: false }
    ]);
    expect(result.results[0].output_handles).toEqual([
      { name: "result", type: { type: "str" } }
    ]);
  });

  it("respects limit parameter", async () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({
        node_type: `nodetool.test.Node${i}`,
        title: `Node ${i}`,
        namespace: "nodetool.test"
      })
    );
    mockSearchResults.mockReturnValueOnce({ sortedResults: nodes });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "node", limit: 3 },
      "call-4",
      ctx
    )) as SearchResult;

    expect(result.count).toBe(3);
    expect(result.total_matches).toBe(10);
    expect(result.results).toHaveLength(3);
  });

  it("prefers nodetool namespace over third-party", async () => {
    const nodes = [
      makeNode({
        node_type: "huggingface.image.Generate",
        title: "HF Generate",
        namespace: "huggingface.image"
      }),
      makeNode({
        node_type: "nodetool.image.Generate",
        title: "NT Generate",
        namespace: "nodetool.image"
      }),
      makeNode({
        node_type: "fal.image.Generate",
        title: "Fal Generate",
        namespace: "fal.image"
      })
    ];
    mockSearchResults.mockReturnValueOnce({ sortedResults: nodes });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "generate" },
      "call-5",
      ctx
    )) as SearchResult;

    expect(result.results[0].node_type).toBe("nodetool.image.Generate");
    expect(result.results[1].node_type).toBe("fal.image.Generate");
    expect(result.results[2].node_type).toBe("huggingface.image.Generate");
  });

  it("returns empty results for no matches", async () => {
    mockSearchResults.mockReturnValueOnce({ sortedResults: [] });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "nonexistent" },
      "call-6",
      ctx
    )) as SearchResult;

    expect(result).toMatchObject({
      ok: true,
      count: 0,
      total_matches: 0,
      results: []
    });
  });

  it("clamps limit to valid range", async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeNode({
        node_type: `nodetool.test.Node${i}`,
        title: `Node ${i}`,
        namespace: "nodetool.test"
      })
    );
    mockSearchResults.mockReturnValueOnce({ sortedResults: nodes });

    const state = makeMockState();
    const ctx = makeCtx(state);

    const result = (await FrontendToolRegistry.call(
      "ui_search_nodes",
      { query: "node", limit: 0 },
      "call-7",
      ctx
    )) as SearchResult;

    expect(result.count).toBe(1);
  });
});
