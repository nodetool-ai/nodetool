/**
 * @jest-environment jsdom
 *
 * What the toolbar's two batch render buttons quote before the click. The
 * number has to be the sum over exactly the shots the button loops, and a
 * batch it cannot price has to say so rather than read as free.
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

import { useRenderBatchCostEstimate } from "../useRenderBatchCostEstimate";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "../renderSpec";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import type { Shot } from "@nodetool-ai/protocol";

const BOARD = "board-batch";

const makeShot = (id: string, seconds: number): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: `shot ${id}`,
  status: "planned",
  duration_seconds: seconds
});

const shots = [makeShot("a", 4), makeShot("b", 6), makeShot("c", 8)];

const selectStillModel = () =>
  act(() => {
    useStoryboardStore.getState().setImageModel(BOARD, {
      type: "image_model",
      id: "fal-ai/flux/schnell",
      provider: "fal_ai" as never,
      name: "Flux Schnell",
      path: ""
    });
  });

const selectClipModel = () =>
  act(() => {
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "pixverse/720p",
      provider: "fal_ai" as never,
      name: "Pixverse"
    });
  });

describe("useRenderBatchCostEstimate", () => {
  beforeEach(() => {
    mockPrice.mockReset();
    act(() => {
      useStoryboardStore.getState().removeBoard(BOARD);
      useStoryboardStore.getState().ensureBoard(BOARD);
    });
  });

  it("sums the still price over every shot the button would render", () => {
    mockPrice.mockReturnValue({
      unit_price: 0.003,
      billing_unit: "images",
      currency: "USD",
      source: "bundle"
    });
    selectStillModel();

    const { result } = renderHook(() =>
      useRenderBatchCostEstimate(BOARD, shots, "still")
    );

    // A still carries no duration — its price is the same for every shot.
    expect(mockPrice).toHaveBeenCalledWith(
      { id: "fal-ai/flux/schnell", provider: "fal_ai" },
      { resolution: STILL_RESOLUTION, seconds: undefined }
    );
    expect(result.current).toMatchObject({
      shotCount: 3,
      pricedCount: 3,
      reasons: []
    });
    expect(result.current.cost).toBeCloseTo(0.009, 9);
  });

  it("prices each clip at its own shot's duration", () => {
    // A per-second model: the batch total must move with the shots' lengths,
    // not be one shot's price times three.
    mockPrice.mockImplementation(
      (_model: unknown, params: { seconds?: number }) => ({
        unit_price: 0.1 * (params.seconds ?? 0),
        billing_unit: "video",
        currency: "USD",
        source: "bundle"
      })
    );
    selectClipModel();

    const { result } = renderHook(() =>
      useRenderBatchCostEstimate(BOARD, shots, "clip")
    );

    expect(mockPrice).toHaveBeenCalledWith(
      { id: "pixverse/720p", provider: "fal_ai" },
      { resolution: CLIP_RESOLUTION, seconds: 6 }
    );
    // 4 s + 6 s + 8 s at $0.1/s.
    expect(result.current.cost).toBeCloseTo(1.8, 9);
    expect(result.current.pricedCount).toBe(3);
  });

  it("says why a batch has no figure instead of quoting zero", () => {
    const { result } = renderHook(() =>
      useRenderBatchCostEstimate(BOARD, shots, "clip")
    );

    expect(mockPrice).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      shotCount: 3,
      cost: 0,
      pricedCount: 0
    });
    // One reason, not one per shot: they all fail the same way.
    expect(result.current.reasons).toEqual([
      "No clip model picked for this board."
    ]);
  });

  it("counts only the shots that priced when the catalog answers for some", () => {
    mockPrice.mockImplementation((_model: unknown, params: { seconds?: number }) =>
      params.seconds === 6
        ? null
        : {
            unit_price: 0.5,
            billing_unit: "video",
            currency: "USD",
            source: "bundle"
          }
    );
    selectClipModel();

    const { result } = renderHook(() =>
      useRenderBatchCostEstimate(BOARD, shots, "clip")
    );

    expect(result.current.pricedCount).toBe(2);
    expect(result.current.cost).toBeCloseTo(1.0, 9);
    expect(result.current.reasons[0]).toContain("No published price");
  });

  it("is empty for a batch with no shots", () => {
    const { result } = renderHook(() =>
      useRenderBatchCostEstimate(BOARD, [], "still")
    );
    expect(result.current).toMatchObject({ shotCount: 0, cost: 0 });
    expect(mockPrice).not.toHaveBeenCalled();
  });
});
