import { act, renderHook } from "@testing-library/react";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { slipSourceWindow, useClipSourceSlip } from "../useClipSourceSlip";

describe("slipSourceWindow", () => {
  const clip = {
    durationMs: 2000,
    inPointMs: 1000,
    outPointMs: 3000,
    speedMultiplier: 1
  };

  it("moves the source window without changing its span", () => {
    expect(slipSourceWindow(clip, 500, 10_000)).toEqual({
      inPointMs: 1500,
      outPointMs: 3500
    });
  });

  it("keeps the window within the source media", () => {
    expect(slipSourceWindow(clip, -2000, 10_000)).toEqual({
      inPointMs: 0,
      outPointMs: 2000
    });
    expect(slipSourceWindow(clip, 9000, 4000)).toEqual({
      inPointMs: 2000,
      outPointMs: 4000
    });
  });

  it("uses the source-rate span when the clip has no explicit out point", () => {
    expect(
      slipSourceWindow(
        { durationMs: 1000, inPointMs: 500, speedMultiplier: 2 },
        500,
        4000
      )
    ).toEqual({ inPointMs: 1000 });
  });
});

describe("useClipSourceSlip link group (F23)", () => {
  const setup = (audioIn: number) => {
    const store = useTimelineStore;
    const tracks = [
      makeTrack({ id: "v", type: "video", name: "v" }),
      makeTrack({ id: "a", type: "audio", name: "a" })
    ];
    const video = makeClip({
      id: "v1",
      trackId: "v",
      mediaType: "video",
      startMs: 0,
      durationMs: 1000,
      inPointMs: 1000,
      outPointMs: 2000,
      linkId: "L"
    });
    const audio = makeClip({
      id: "a1",
      trackId: "a",
      mediaType: "audio",
      startMs: 0,
      durationMs: 1000,
      inPointMs: audioIn,
      outPointMs: audioIn + 1000,
      linkId: "L"
    });
    store.setState({ tracks, clips: [video, audio], linkedSelection: true });
    const element = document.createElement("div");
    const { result, rerender } = renderHook(
      ({ clip }) =>
        useClipSourceSlip({
          clip,
          interactionLocked: false,
          msPerPx: 1,
          sourceDurationMs: 10_000
        }),
      { initialProps: { clip: video } }
    );
    act(() => {
      result.current(element);
    });
    // The wheel listener attaches in an effect keyed on the clip identity.
    rerender({ clip: { ...video } });
    return { element, store };
  };
  const wheel = (element: HTMLElement, deltaX: number) =>
    act(() => {
      element.dispatchEvent(
        new WheelEvent("wheel", { altKey: true, deltaX, cancelable: true })
      );
    });

  it("slips the linked audio with the video", () => {
    const { element, store } = setup(1000);
    wheel(element, 200);
    const c = Object.fromEntries(
      store.getState().clips.map((x) => [x.id, x.inPointMs])
    );
    expect(c).toEqual({ v1: 1200, a1: 1200 });
  });

  it("refuses the slip when a linked member would run out of source", () => {
    const { element, store } = setup(100);
    wheel(element, -500);
    const c = Object.fromEntries(
      store.getState().clips.map((x) => [x.id, x.inPointMs])
    );
    expect(c).toEqual({ v1: 1000, a1: 100 });
  });
});
