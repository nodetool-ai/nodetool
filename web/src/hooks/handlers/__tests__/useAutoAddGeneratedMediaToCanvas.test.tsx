import { renderHook } from "@testing-library/react";
import type { Message } from "../../../stores/ApiTypes";

interface MockChatState {
  status: string;
  currentThreadId: string | null;
  messageCache: Record<string, Message[]>;
}

let mockState: MockChatState = {
  status: "connected",
  currentThreadId: "t1",
  messageCache: {}
};

const addBlocksToCanvas = jest.fn();
let isCanvasAvailable = true;

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (s: MockChatState) => unknown) => selector(mockState)
}));

jest.mock("../useGenerationToCanvas", () => ({
  __esModule: true,
  useAddMediaToCanvas: () => ({ isCanvasAvailable, addBlocksToCanvas })
}));

import { useAutoAddGeneratedMediaToCanvas } from "../useAutoAddGeneratedMediaToCanvas";

const mediaMessage = (assetId: string): Message =>
  ({
    role: "assistant",
    content: [
      {
        type: "image_url",
        image: { type: "image", asset_id: assetId, uri: `http://x/${assetId}.png` }
      }
    ]
  }) as unknown as Message;

beforeEach(() => {
  addBlocksToCanvas.mockClear();
  isCanvasAvailable = true;
  mockState = { status: "connected", currentThreadId: "t1", messageCache: {} };
});

describe("useAutoAddGeneratedMediaToCanvas", () => {
  it("adds generated media on the busy → idle edge", () => {
    const { rerender } = renderHook(() => useAutoAddGeneratedMediaToCanvas());
    expect(addBlocksToCanvas).not.toHaveBeenCalled();

    // Generation starts.
    mockState = { ...mockState, status: "streaming" };
    rerender();
    expect(addBlocksToCanvas).not.toHaveBeenCalled();

    // Generation finishes with a media result.
    mockState = {
      ...mockState,
      status: "connected",
      messageCache: { t1: [mediaMessage("a1")] }
    };
    rerender();
    expect(addBlocksToCanvas).toHaveBeenCalledTimes(1);
    expect(addBlocksToCanvas.mock.calls[0][0]).toHaveLength(1);
  });

  it("does not add the same asset twice across turns", () => {
    const { rerender } = renderHook(() => useAutoAddGeneratedMediaToCanvas());

    mockState = { ...mockState, status: "streaming" };
    rerender();
    mockState = {
      ...mockState,
      status: "connected",
      messageCache: { t1: [mediaMessage("a1")] }
    };
    rerender();
    expect(addBlocksToCanvas).toHaveBeenCalledTimes(1);

    // A second turn that still ends on the same last message adds nothing new.
    mockState = { ...mockState, status: "streaming" };
    rerender();
    mockState = { ...mockState, status: "connected" };
    rerender();
    expect(addBlocksToCanvas).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no canvas is available", () => {
    isCanvasAvailable = false;
    const { rerender } = renderHook(() => useAutoAddGeneratedMediaToCanvas());

    mockState = { ...mockState, status: "streaming" };
    rerender();
    mockState = {
      ...mockState,
      status: "connected",
      messageCache: { t1: [mediaMessage("a1")] }
    };
    rerender();
    expect(addBlocksToCanvas).not.toHaveBeenCalled();
  });
});
