/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      get: { useQuery: () => ({ data: undefined }) }
    }
  },
  trpcClient: {}
}));

const mockPrice = jest.fn();
jest.mock("../../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (...args: unknown[]) => mockPrice(...args)
}));

import { useShotCostEstimate } from "../useShotCostEstimate";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import type { Shot } from "@nodetool-ai/protocol";

const BOARD = "board-cost";

const shot: Shot = {
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "a lighthouse at dusk",
  status: "planned",
  duration_seconds: 4,
  cost_estimate: 0.42
};

describe("useShotCostEstimate", () => {
  beforeEach(() => {
    mockPrice.mockReset();
    act(() => {
      useStoryboardStore.getState().removeBoard(BOARD);
      useStoryboardStore.getState().ensureBoard(BOARD);
    });
  });

  it("prices the shot off the board's video model and the shot's duration", () => {
    mockPrice.mockReturnValue({
      unit_price: 0.2,
      billing_unit: "video",
      currency: "USD",
      source: "bundle"
    });
    act(() => {
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "pixverse/720p",
        provider: "fal_ai" as never,
        name: "Pixverse"
      });
    });

    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(mockPrice).toHaveBeenCalledWith(
      { id: "pixverse/720p", provider: "fal_ai" },
      { seconds: 4 }
    );
    expect(result.current).toEqual({ cost: 0.2, source: "live" });
  });

  it("falls back to the shot's stored estimate when no video model is selected", () => {
    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(mockPrice).not.toHaveBeenCalled();
    expect(result.current).toEqual({ cost: 0.42, source: "stored" });
  });

  it("falls back to the stored estimate when the catalog has no price", () => {
    mockPrice.mockReturnValue(null);
    act(() => {
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "unknown/model",
        provider: "fal_ai" as never,
        name: "Unknown"
      });
    });

    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(result.current).toEqual({ cost: 0.42, source: "stored" });
  });

  it("returns null when there is neither a live price nor a stored estimate", () => {
    const bareShot: Shot = { ...shot, cost_estimate: undefined };
    const { result } = renderHook(() =>
      useShotCostEstimate(BOARD, bareShot)
    );

    expect(result.current).toBeNull();
  });

  it("refuses a price billed in a currency-less unit (credits)", () => {
    mockPrice.mockReturnValue({
      unit_price: 10,
      billing_unit: "credits",
      currency: "credits",
      source: "bundle"
    });
    act(() => {
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "credit/model",
        provider: "fal_ai" as never,
        name: "Credits"
      });
    });

    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(result.current).toEqual({ cost: 0.42, source: "stored" });
  });
});
