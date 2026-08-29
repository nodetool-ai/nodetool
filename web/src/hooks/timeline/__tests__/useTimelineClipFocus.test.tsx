/**
 * @jest-environment jsdom
 *
 * The receiving half of a deep link into the cut: a parked clip id lands as a
 * selection, a playhead position, and a scroll request — once, and only for
 * the sequence it names.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../stores/timeline/TimelineInstance";
import { useDocumentFocusStore } from "../../../stores/DocumentFocusStore";
import { useTimelineClipFocus } from "../useTimelineClipFocus";
import { makeClip } from "@nodetool-ai/timeline";

let instance: TimelineInstance;

/** One imported clip on a fresh video track. Returns its id. */
const addClip = (name: string, startMs: number): string => {
  const doc = instance.doc;
  act(() => doc.getState().addTrack("video", "V"));
  const trackId = doc.getState().tracks[0].id;
  const clip = makeClip({
    trackId,
    name,
    startMs,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    versions: []
  });
  act(() => doc.getState().addClip(clip));
  return clip.id;
};

const render = (sequenceId: string) =>
  renderHook(() => useTimelineClipFocus(sequenceId), {
    wrapper: ({ children }) => (
      <TimelineProvider instance={instance}>{children}</TimelineProvider>
    )
  });

beforeEach(() => {
  instance = createTimelineInstance();
  useDocumentFocusStore.setState({ pending: null });
});

describe("useTimelineClipFocus", () => {
  it("selects the requested clip, parks the playhead, and asks for a scroll", () => {
    const clipId = addClip("clip-1", 12_000);
    useDocumentFocusStore
      .getState()
      .requestDocumentFocus({ type: "timeline", ref: "seq-1", clipId });

    render("seq-1");

    expect([...instance.ui.getState().selectedClipIds]).toEqual([clipId]);
    expect(instance.playback.getState().currentTimeMs).toBe(12_000);
    expect(instance.ui.getState().revealRequest).toEqual({ timeMs: 12_000 });
    // One-shot: applying it drops the request.
    expect(useDocumentFocusStore.getState().pending).toBeNull();
  });

  it("leaves a request for another sequence alone", () => {
    const clipId = addClip("clip-1", 12_000);
    const request = {
      type: "timeline" as const,
      ref: "seq-other",
      clipId
    };
    useDocumentFocusStore.getState().requestDocumentFocus(request);

    render("seq-1");

    expect(instance.ui.getState().selectedClipIds.size).toBe(0);
    expect(useDocumentFocusStore.getState().pending).toBe(request);
  });

  it("keeps a request naming a clip this sequence does not carry", () => {
    const request = {
      type: "timeline" as const,
      ref: "seq-1",
      clipId: "clip-gone"
    };
    useDocumentFocusStore.getState().requestDocumentFocus(request);

    render("seq-1");

    expect(instance.ui.getState().selectedClipIds.size).toBe(0);
    expect(useDocumentFocusStore.getState().pending).toBe(request);
  });

  it("applies a request that arrives after the document loaded", () => {
    const clipId = addClip("clip-1", 8_000);
    render("seq-1");
    expect(instance.ui.getState().selectedClipIds.size).toBe(0);

    act(() =>
      useDocumentFocusStore
        .getState()
        .requestDocumentFocus({ type: "timeline", ref: "seq-1", clipId })
    );

    expect([...instance.ui.getState().selectedClipIds]).toEqual([clipId]);
  });
});
