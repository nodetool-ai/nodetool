/**
 * @jest-environment jsdom
 *
 * A voice sample is a real TTS call, so the voices step must bill one per tile
 * and no more (PRD § 9.3). This suite is the thing standing between a grid of
 * a dozen voices and a dozen calls on every render: it counts the calls across
 * repeated renders, repeated clicks, and a remount of the step.
 */
import { act, renderHook } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

import { resetVoiceSamples, useVoiceSamples } from "../useVoiceSamples";

const RACHEL = { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" };
const ADAM = { provider: "elevenlabs", model: "eleven_v3", voice: "adam" };
const LINE = "The tide came in before dawn.";

beforeEach(() => {
  rpcRequest.mockReset();
  rpcRequest.mockResolvedValue({ asset_ids: ["asset-1"] });
  resetVoiceSamples();
});

describe("useVoiceSamples", () => {
  it("makes one call per tile, however often the tile is asked", async () => {
    const { result, rerender } = renderHook(() => useVoiceSamples());

    await act(async () => {
      result.current.play(RACHEL, LINE);
    });
    rerender();
    await act(async () => {
      result.current.play(RACHEL, LINE);
      result.current.play(RACHEL, LINE);
    });
    rerender();

    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest).toHaveBeenCalledWith("generate_media", {
      mode: "audio",
      provider: RACHEL.provider,
      model: RACHEL.model,
      voice: RACHEL.voice,
      prompt: LINE
    });
    expect(result.current.sampleFor(RACHEL, LINE)).toEqual({
      pending: false,
      assetId: "asset-1"
    });
  });

  it("renders nothing for a tile nobody asked to hear", () => {
    const { result } = renderHook(() => useVoiceSamples());
    expect(result.current.sampleFor(RACHEL, LINE)).toEqual({ pending: false });
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("bills one call per voice, not one per grid", async () => {
    const { result } = renderHook(() => useVoiceSamples());
    await act(async () => {
      result.current.play(RACHEL, LINE);
      result.current.play(ADAM, LINE);
    });
    expect(rpcRequest).toHaveBeenCalledTimes(2);
  });

  it("keeps a paid-for sample across a remount of the step", async () => {
    const first = renderHook(() => useVoiceSamples());
    await act(async () => {
      first.result.current.play(RACHEL, LINE);
    });
    first.unmount();

    const second = renderHook(() => useVoiceSamples());
    expect(second.result.current.sampleFor(RACHEL, LINE).assetId).toBe("asset-1");
    await act(async () => {
      second.result.current.play(RACHEL, LINE);
    });
    expect(rpcRequest).toHaveBeenCalledTimes(1);
  });

  it("makes a new sample when the line changes", async () => {
    const { result } = renderHook(() => useVoiceSamples());
    await act(async () => {
      result.current.play(RACHEL, LINE);
      result.current.play(RACHEL, "A different first line.");
    });
    expect(rpcRequest).toHaveBeenCalledTimes(2);
  });

  it("does not call for a speaker with no lines", async () => {
    const { result } = renderHook(() => useVoiceSamples());
    await act(async () => {
      result.current.play(RACHEL, "   ");
    });
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("reports a failed sample and does not retry it on the next render", async () => {
    rpcRequest.mockRejectedValue(new Error("that voice is unavailable"));
    const { result, rerender } = renderHook(() => useVoiceSamples());

    await act(async () => {
      result.current.play(RACHEL, LINE);
    });
    rerender();

    expect(result.current.sampleFor(RACHEL, LINE).error).toBe(
      "that voice is unavailable"
    );
    expect(rpcRequest).toHaveBeenCalledTimes(1);
  });
});
