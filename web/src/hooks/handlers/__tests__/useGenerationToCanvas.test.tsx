import { renderHook, act } from "@testing-library/react";

let nodeCounter = 0;
const createNode = jest.fn((_meta: unknown, position: { x: number; y: number }) => ({
  id: `node-${(nodeCounter += 1)}`,
  position,
  data: { properties: {} as Record<string, unknown> }
}));
const addNode = jest.fn();
const nodeStoreState = { nodes: [] as unknown[], createNode, addNode };
const getMetadata = jest.fn(() => ({ node_type: "stub" }));

jest.mock("../../../contexts/NodeContext", () => ({
  NodeContext: { Provider: ({ children }: { children: unknown }) => children }
}));

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    useContext: () => ({ getState: () => nodeStoreState })
  };
});

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: (selector: (s: { getMetadata: typeof getMetadata }) => unknown) =>
    selector({ getMetadata })
}));

import {
  useAddMediaToCanvas,
  type MediaContentBlock
} from "../useGenerationToCanvas";

const imageBlock: MediaContentBlock = {
  type: "image_url",
  image: { type: "image", asset_id: "a1", uri: "http://x/img.png" }
} as MediaContentBlock;

beforeEach(() => {
  createNode.mockClear();
  addNode.mockClear();
  getMetadata.mockClear();
  nodeCounter = 0;
});

describe("useAddMediaToCanvas", () => {
  it("creates a constant node when addBlocksToCanvas is called", () => {
    const { result } = renderHook(() => useAddMediaToCanvas());

    act(() => {
      result.current.addBlocksToCanvas([imageBlock]);
    });

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

  it("reports canvas availability based on NodeContext", () => {
    const { result } = renderHook(() => useAddMediaToCanvas());
    expect(result.current.isCanvasAvailable).toBe(true);
  });
});
