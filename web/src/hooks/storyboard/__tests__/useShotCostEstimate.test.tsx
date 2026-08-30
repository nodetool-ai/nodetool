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
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "../renderSpec";
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

    // The rung the render actually sends, so the figure is the one the
    // provider will bill.
    expect(mockPrice).toHaveBeenCalledWith(
      { id: "pixverse/720p", provider: "fal_ai" },
      { resolution: CLIP_RESOLUTION, seconds: 4 }
    );
    expect(result.current).toMatchObject({
      cost: 0.2,
      source: "live",
      // The still has no model on this board, so it reports why instead of a
      // figure; the clip is priced.
      steps: [
        { label: "Still", cost: null },
        { label: "Clip", cost: 0.2 }
      ]
    });
  });

  it("falls back to the shot's stored estimate when no video model is selected", () => {
    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(mockPrice).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ cost: 0.42, source: "stored" });
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

    expect(result.current).toMatchObject({ cost: 0.42, source: "stored" });
  });

  it("reports why each step is unpriced when nothing prices and nothing is stored", () => {
    const bareShot: Shot = { ...shot, cost_estimate: undefined };
    const { result } = renderHook(() =>
      useShotCostEstimate(BOARD, bareShot)
    );

    expect(result.current).toMatchObject({
      cost: 0,
      source: "live",
      steps: [
        { label: "Still", reason: "No still model picked for this board." },
        { label: "Clip", reason: "No clip model picked for this board." }
      ]
    });
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

    expect(result.current).toMatchObject({ cost: 0.42, source: "stored" });
  });

  it("sums the still and the clip, and says which is which", () => {
    mockPrice.mockImplementation((model: { id: string }) =>
      model.id === "img/model"
        ? {
            unit_price: 0.04,
            billing_unit: "images",
            currency: "USD",
            source: "bundle",
            breakdown: "$0.04 per images"
          }
        : {
            unit_price: 0.2,
            billing_unit: "seconds",
            currency: "USD",
            source: "bundle",
            breakdown: "4 s × $0.05/s"
          }
    );
    act(() => {
      useStoryboardStore.getState().setImageModel(BOARD, {
        type: "image_model",
        id: "img/model",
        provider: "fal_ai" as never,
        name: "Image",
        path: ""
      });
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "vid/model",
        provider: "fal_ai" as never,
        name: "Video"
      });
    });

    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(mockPrice).toHaveBeenCalledWith(
      { id: "img/model", provider: "fal_ai" },
      { resolution: STILL_RESOLUTION }
    );
    expect(result.current?.cost).toBeCloseTo(0.24, 10);
    expect(result.current?.steps).toEqual([
      { label: "Still", cost: 0.04, breakdown: "$0.04 per images" },
      { label: "Clip", cost: 0.2, breakdown: "4 s × $0.05/s" }
    ]);
  });

  it("charges a direct shot for the clip only — it renders no still", () => {
    mockPrice.mockReturnValue({
      unit_price: 0.2,
      billing_unit: "seconds",
      currency: "USD",
      source: "bundle"
    });
    act(() => {
      useStoryboardStore.getState().setImageModel(BOARD, {
        type: "image_model",
        id: "img/model",
        provider: "fal_ai" as never,
        name: "Image",
        path: ""
      });
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "vid/model",
        provider: "fal_ai" as never,
        name: "Video"
      });
    });

    const { result } = renderHook(() =>
      useShotCostEstimate(BOARD, { ...shot, render_mode: "direct" })
    );

    expect(result.current?.steps).toEqual([
      expect.objectContaining({ label: "Clip" })
    ]);
    expect(result.current?.cost).toBeCloseTo(0.2, 10);
  });

  it("carries the catalog's assumptions and warnings into the notes", () => {
    mockPrice.mockReturnValue({
      unit_price: 0.2,
      billing_unit: "seconds",
      currency: "USD",
      source: "bundle",
      assumptions: ["resolution not set on the node"],
      warnings: ["reference images are not priced for this model"]
    });
    act(() => {
      useStoryboardStore.getState().setVideoModel(BOARD, {
        type: "video_model",
        id: "vid/model",
        provider: "fal_ai" as never,
        name: "Video"
      });
    });

    const { result } = renderHook(() => useShotCostEstimate(BOARD, shot));

    expect(result.current?.notes).toEqual([
      "resolution not set on the node",
      "reference images are not priced for this model"
    ]);
  });
});
