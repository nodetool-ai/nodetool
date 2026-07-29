/** @jest-environment node */
import { buildTimelineDocumentPayload } from "../timelineDocumentPayload";

describe("buildTimelineDocumentPayload", () => {
  const baseState = {
    tracks: [{ id: "t1", name: "Track 1", type: "video" as const, clips: [] }],
    clips: { c1: { id: "c1", trackId: "t1", startTime: 0, endTime: 5 } },
    markers: [{ id: "m1", time: 2, label: "Intro" }],
    transcript: { segments: [] },
    scriptEnabled: true
  };

  it("picks exactly the document fields from state", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(Object.keys(payload).sort()).toEqual([
      "clips",
      "markers",
      "scriptEnabled",
      "tracks",
      "transcript"
    ]);
  });

  it("preserves the tracks array by reference", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(payload.tracks).toBe(baseState.tracks);
  });

  it("preserves the clips object by reference", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(payload.clips).toBe(baseState.clips);
  });

  it("preserves the markers array by reference", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(payload.markers).toBe(baseState.markers);
  });

  it("preserves the transcript by reference", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(payload.transcript).toBe(baseState.transcript);
  });

  it("preserves the scriptEnabled flag", () => {
    const payload = buildTimelineDocumentPayload(baseState as never);
    expect(payload.scriptEnabled).toBe(true);
  });

  it("excludes extra state fields", () => {
    const stateWithExtras = {
      ...baseState,
      playheadTime: 3,
      zoom: 1.5,
      selectedClipId: "c1"
    };
    const payload = buildTimelineDocumentPayload(stateWithExtras as never);
    expect(payload).not.toHaveProperty("playheadTime");
    expect(payload).not.toHaveProperty("zoom");
    expect(payload).not.toHaveProperty("selectedClipId");
  });
});
