import { describe, it, expect } from "@jest/globals";
import { makeTrack } from "@nodetool-ai/timeline";

import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { StoredDraft } from "../../../lib/cloud/CloudDocumentSaver";
import { resumeTimelineDraft, timelineDraftDocument } from "../useCloudWindowTimelineDrafts";

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "timeline", documentId: "t1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-19T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

describe("cloud window timeline drafts", () => {
  it("takes a stored draft up again as edits, outside undo history", () => {
    const edited = createTimelineStore();
    const track = makeTrack({ name: "Voice" });
    edited.getState().applyExternalMerge({ tracks: [track], fps: 25, width: 1080, height: 1920 });
    const draft = timelineDraftDocument(edited.getState());

    const opened = createTimelineStore();
    expect(resumeTimelineDraft(opened, stored(draft))).toBe(true);

    const state = opened.getState();
    expect(state.tracks.map((t) => t.name)).toEqual(["Voice"]);
    expect([state.fps, state.width, state.height]).toEqual([25, 1080, 1920]);
    expect(opened.temporal.getState().pastStates).toHaveLength(0);
  });

  it("refuses a draft that is not a timeline document", () => {
    const store = createTimelineStore();
    expect(resumeTimelineDraft(store, stored("not json"))).toBe(false);
    expect(resumeTimelineDraft(store, stored(JSON.stringify({ graph: {} })))).toBe(false);
    expect(store.getState().tracks).toEqual([]);
  });
});
