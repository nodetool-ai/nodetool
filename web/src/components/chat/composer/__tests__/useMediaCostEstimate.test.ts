import { act, renderHook } from "@testing-library/react";
import useMediaGenerationStore from "../../../../stores/MediaGenerationStore";
import { useMediaCostEstimate } from "../useMediaCostEstimate";

/** A fal video endpoint whose published grid sells 720p and 1080p apart. */
const VIDEO_MODEL = {
  type: "video_model" as const,
  id: "wan/v2.6/image-to-video",
  provider: "fal_ai",
  name: "Wan 2.6"
};

/** A fal image endpoint with a 1K / 2K / 4K ladder. */
const IMAGE_MODEL = {
  type: "image_model" as const,
  id: "fal-ai/nano-banana-2",
  provider: "fal_ai",
  name: "Nano Banana 2",
  path: ""
};

const setVideo = (patch: Parameters<
  ReturnType<typeof useMediaGenerationStore.getState>["setVideoParams"]
>[0]) =>
  act(() => {
    useMediaGenerationStore.getState().setVideoParams(patch);
  });

const setImage = (patch: Parameters<
  ReturnType<typeof useMediaGenerationStore.getState>["setImageParams"]
>[0]) =>
  act(() => {
    useMediaGenerationStore.getState().setImageParams(patch);
  });

describe("useMediaCostEstimate", () => {
  it("returns nothing while no model is picked", () => {
    setVideo({ model: null });
    const { result } = renderHook(() => useMediaCostEstimate("video"));
    expect(result.current).toBeNull();
  });

  it("returns nothing in chat mode", () => {
    setVideo({ model: VIDEO_MODEL, duration: 5, resolution: "720p" });
    const { result } = renderHook(() => useMediaCostEstimate("chat"));
    expect(result.current).toBeNull();
  });

  it("bills the clip the duration asks for", () => {
    setVideo({ model: VIDEO_MODEL, duration: 5, resolution: "720p" });
    const { result, rerender } = renderHook(() =>
      useMediaCostEstimate("video")
    );
    expect(result.current?.total).toBeCloseTo(0.5, 10);
    expect(result.current?.label).toBe("$0.5");
    expect(result.current?.breakdown).toBe("5 s × $0.1/s at 720p");

    setVideo({ duration: 10 });
    rerender();
    expect(result.current?.total).toBeCloseTo(1, 10);
  });

  it("moves with the resolution rung", () => {
    setVideo({ model: VIDEO_MODEL, duration: 5, resolution: "720p" });
    const { result, rerender } = renderHook(() =>
      useMediaCostEstimate("video")
    );
    const cheap = result.current?.total ?? 0;

    setVideo({ resolution: "1080p" });
    rerender();
    expect(result.current?.total).toBeGreaterThan(cheap);
    expect(result.current?.total).toBeCloseTo(0.75, 10);
  });

  it("multiplies an image estimate by the variation count", () => {
    setImage({
      model: IMAGE_MODEL,
      resolution: "1K",
      aspectRatio: "1:1",
      variations: 1
    });
    const { result, rerender } = renderHook(() =>
      useMediaCostEstimate("image")
    );
    const one = result.current?.total ?? 0;
    expect(one).toBeGreaterThan(0);

    setImage({ variations: 4 });
    rerender();
    expect(result.current?.quantity).toBe(4);
    expect(result.current?.total).toBeCloseTo(one * 4, 10);
  });

  it("shows nothing for a model no catalog prices", () => {
    setVideo({
      model: { ...VIDEO_MODEL, id: "nobody/ships-this", provider: "fal_ai" },
      duration: 5
    });
    const { result } = renderHook(() => useMediaCostEstimate("video"));
    expect(result.current).toBeNull();
  });
});
