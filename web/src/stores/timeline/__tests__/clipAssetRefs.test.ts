import { makeClip } from "@nodetool-ai/timeline";
import type { ClipVersion, TimelineSequence } from "@nodetool-ai/timeline";
import { normalizeClipAssetRefs } from "../clipAssetRefs";
import { createTimelineStore } from "../TimelineStore";

const FULL = "3e53f6cbb3a34f949de988183791cd14";
const SHORT = "3e53f6cbb3a3";
const PACKAGE = "package://nodetool-base/timelines/voltra/street.jpg";

const version = (assetId: string): ClipVersion => ({
  id: "v1",
  createdAt: "",
  jobId: "",
  assetId,
  workflowUpdatedAt: "",
  dependencyHash: "",
  paramOverridesSnapshot: {},
  status: "success"
});

const clipFor = (ref: string) =>
  makeClip({
    trackId: "t1",
    mediaType: "image",
    startMs: 0,
    durationMs: 1000,
    currentAssetId: ref,
    versions: [version(ref)]
  });

describe("normalizeClipAssetRefs", () => {
  it.each([
    [FULL, FULL],
    [SHORT, SHORT],
    [`asset://${SHORT}`, SHORT],
    [`asset://${SHORT}.jpg`, SHORT]
  ])("reads %s as %s", (ref, id) => {
    const [clip] = normalizeClipAssetRefs([clipFor(ref)]);
    expect(clip.currentAssetId).toBe(id);
    expect(clip.versions[0].assetId).toBe(id);
  });

  it("keeps package locators and returns the same array when nothing changes", () => {
    const clips = [clipFor(PACKAGE), clipFor(FULL)];
    expect(normalizeClipAssetRefs(clips)).toBe(clips);
  });

  it("is applied when the editor loads a sequence", () => {
    const store = createTimelineStore();
    store.getState().loadSequence({
      id: "seq",
      projectId: "",
      name: "seq",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 1000,
      tracks: [],
      clips: [clipFor(`asset://${SHORT}.jpg`)],
      markers: [],
      createdAt: "",
      updatedAt: ""
    } as TimelineSequence);
    expect(store.getState().clips[0].currentAssetId).toBe(SHORT);
  });
});
