import { renderHook, act } from "@testing-library/react";

type AnyMsg = {
  id?: string;
  role: string;
  content: unknown;
};

// Mutable backing state for the mocked stores; each rerender reads it fresh.
const gcState: { currentThreadId: string | null; messageCache: Record<string, AnyMsg[]> } = {
  currentThreadId: "t1",
  messageCache: { t1: [] }
};

const createNode = jest.fn((_meta: unknown, position: { x: number; y: number }) => ({
  id: `node-${createNode.mock.calls.length}`,
  position,
  data: { properties: {} as Record<string, unknown> }
}));
const addNode = jest.fn();
const nodeStoreState = { nodes: [] as unknown[], createNode, addNode };
const getMetadata = jest.fn(() => ({ node_type: "stub" }));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: () => ({ getState: () => nodeStoreState })
}));

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (s: typeof gcState) => unknown) => selector(gcState)
}));

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: (selector: (s: { getMetadata: typeof getMetadata }) => unknown) =>
    selector({ getMetadata })
}));

import { useGenerationToCanvas } from "../useGenerationToCanvas";

const imageMessage = (id: string): AnyMsg => ({
  id,
  role: "assistant",
  content: [
    {
      type: "image_url",
      image: { type: "image", asset_id: "a1", uri: "http://x/img.png" }
    }
  ]
});

beforeEach(() => {
  createNode.mockClear();
  addNode.mockClear();
  getMetadata.mockClear();
  gcState.currentThreadId = "t1";
  gcState.messageCache = { t1: [] };
});

describe("useGenerationToCanvas", () => {
  it("drops a node for a new assistant media message after a generation is requested", () => {
    const { result, rerender } = renderHook(() => useGenerationToCanvas());

    act(() => {
      result.current.markGenerationStarted();
    });

    gcState.messageCache = { t1: [imageMessage("m1")] };
    rerender();

    expect(createNode).toHaveBeenCalledTimes(1);
    expect(addNode).toHaveBeenCalledTimes(1);
    const created = addNode.mock.calls[0][0] as {
      data: { properties: { value: unknown } };
    };
    expect(created.data.properties.value).toEqual({
      type: "image",
      asset_id: "a1",
      uri: "http://x/img.png"
    });
  });

  it("does not drop nodes for messages that predate mount (history)", () => {
    gcState.messageCache = { t1: [imageMessage("old")] };
    const { rerender } = renderHook(() => useGenerationToCanvas());
    rerender();
    expect(addNode).not.toHaveBeenCalled();
  });

  it("ignores assistant media when no generation was requested", () => {
    const { rerender } = renderHook(() => useGenerationToCanvas());
    gcState.messageCache = { t1: [imageMessage("m1")] };
    rerender();
    expect(addNode).not.toHaveBeenCalled();
  });
});
