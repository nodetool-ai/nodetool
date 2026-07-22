/**
 * @jest-environment node
 */

import { loadMetadata, prefetchMetadata, WORKFLOW_NODE_TYPE } from "../useMetadata";

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

jest.mock("../../stores/MetadataStore", () => {
  const state = {
    setMetadata: jest.fn(),
    setRecommendedModels: jest.fn(),
    setNodeTypes: jest.fn()
  };
  const store: any = () => state;
  store.getState = () => state;
  return { __esModule: true, default: store };
});

jest.mock("../../components/node_menu/typeFilterUtils", () => ({
  createConnectabilityMatrix: jest.fn()
}));

jest.mock("../../config/snippetMetadata", () => ({
  generateSnippetMetadata: jest.fn(() => ({
    "snippet.test": { node_type: "snippet.test", title: "Snippet" }
  }))
}));

jest.mock("../../components/node/BaseNode", () => ({
  __esModule: true,
  default: "MockBaseNode"
}));


import { restFetch } from "../../lib/rest-fetch";
import useMetadataStore from "../../stores/MetadataStore";
import { createConnectabilityMatrix } from "../../components/node_menu/typeFilterUtils";

const mockRestFetch = restFetch as jest.MockedFunction<typeof restFetch>;

describe("loadMetadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 'error' when fetch fails", async () => {
    mockRestFetch.mockResolvedValue({
      ok: false,
      status: 500
    } as Response);

    const result = await loadMetadata();

    expect(result).toBe("error");
    expect(useMetadataStore.getState().setMetadata).not.toHaveBeenCalled();
  });

  it("returns 'success' and processes metadata on success", async () => {
    const mockMetadata = [
      {
        node_type: "test.TextNode",
        title: "Text Node",
        namespace: "test",
        properties: [],
        outputs: [],
        recommended_models: []
      },
      {
        node_type: "test.ImageNode",
        title: "Image Node",
        namespace: "test",
        properties: [],
        outputs: [],
        recommended_models: [
          { type: "hf", repo_id: "model/a", path: "model.safetensors" }
        ]
      }
    ];

    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetadata
    } as Response);

    const result = await loadMetadata();

    expect(result).toBe("success");
    expect(useMetadataStore.getState().setMetadata).toHaveBeenCalledTimes(1);
    expect(useMetadataStore.getState().setNodeTypes).toHaveBeenCalledTimes(1);
    expect(useMetadataStore.getState().setRecommendedModels).toHaveBeenCalledTimes(1);
    expect(createConnectabilityMatrix).toHaveBeenCalled();
  });

  it("includes default metadata for Preview and Workflow nodes", async () => {
    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await loadMetadata();

    const setMetadataCall = (useMetadataStore.getState().setMetadata as jest.Mock)
      .mock.calls[0][0];
    expect(setMetadataCall["nodetool.workflows.base_node.Preview"]).toBeDefined();
    expect(setMetadataCall[WORKFLOW_NODE_TYPE]).toBeDefined();
  });

  it("includes snippet metadata", async () => {
    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await loadMetadata();

    const setMetadataCall = (useMetadataStore.getState().setMetadata as jest.Mock)
      .mock.calls[0][0];
    expect(setMetadataCall["snippet.test"]).toBeDefined();
  });

  it("deduplicates recommended models", async () => {
    const mockMetadata = [
      {
        node_type: "test.Node1",
        title: "Node 1",
        namespace: "test",
        properties: [],
        outputs: [],
        recommended_models: [
          { type: "hf", repo_id: "model/a", path: "weights.bin" }
        ]
      },
      {
        node_type: "test.Node2",
        title: "Node 2",
        namespace: "test",
        properties: [],
        outputs: [],
        recommended_models: [
          { type: "hf", repo_id: "model/a", path: "weights.bin" },
          { type: "hf", repo_id: "model/b", path: "weights.bin" }
        ]
      }
    ];

    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMetadata
    } as Response);

    await loadMetadata();

    const setModelsCall = (
      useMetadataStore.getState().setRecommendedModels as jest.Mock
    ).mock.calls[0][0];
    expect(setModelsCall).toHaveLength(2);
  });

  it("fetches from the correct endpoint", async () => {
    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await loadMetadata();

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/nodes/metadata?fields=full&limit=10000"
    );
  });

  it("reuses a successful prefetch instead of refetching", async () => {
    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    prefetchMetadata();
    prefetchMetadata(); // second call is a no-op (cached)
    const result = await loadMetadata();

    expect(result).toBe("success");
    // One request total: the prefetch is reused, not re-issued by loadMetadata.
    expect(mockRestFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a fresh fetch when the prefetch fails", async () => {
    mockRestFetch
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    prefetchMetadata();
    const result = await loadMetadata();

    expect(result).toBe("success");
    expect(mockRestFetch).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a consumed prefetch on a later reload", async () => {
    mockRestFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    prefetchMetadata();
    await loadMetadata(); // consumes the prefetch
    await loadMetadata(); // must issue a fresh request

    expect(mockRestFetch).toHaveBeenCalledTimes(2);
  });
});
