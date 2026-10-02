import { beforeEach, describe, expect, it } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import {
  buildPastedClips,
  clearClipClipboard,
  cloneClipsToTrack,
  copyClipsToClipboard
} from "../clipboardOps";

describe.each([
  {
    operation: "paste",
    copy: (clips: TimelineClip[], track: TimelineTrack) => {
      copyClipsToClipboard(clips);
      return buildPastedClips([track], 10_000);
    }
  },
  {
    operation: "duplicate track",
    copy: (clips: TimelineClip[], track: TimelineTrack) =>
      cloneClipsToTrack(clips, track.id)
  }
])("$operation groups", ({ copy }) => {
  beforeEach(clearClipClipboard);

  it("copies nested groups with each child attached to its copied parent", () => {
    const track = makeTrack({ type: "video", name: "Source" });
    const outer = makeClip({
      trackId: track.id,
      name: "Outer group",
      mediaType: "group",
      startMs: 0,
      durationMs: 1000
    });
    const inner = makeClip({
      trackId: track.id,
      name: "Inner group",
      mediaType: "group",
      parentId: outer.id,
      startMs: 0,
      durationMs: 1000
    });
    const child = makeClip({
      trackId: track.id,
      name: "Child",
      mediaType: "video",
      parentId: inner.id,
      startMs: 100,
      durationMs: 500
    });
    const target = makeTrack({ type: "video", name: "Target" });

    const copied = copy([child, inner, outer], target);
    expect(copied).toHaveLength(3);
    const copiedOuter = copied.find((clip) => clip.name === outer.name)!;
    const copiedInner = copied.find((clip) => clip.name === inner.name)!;
    const copiedChild = copied.find((clip) => clip.name === child.name)!;
    expect(copiedOuter.id).not.toBe(outer.id);
    expect(copiedInner.id).not.toBe(inner.id);
    expect(copiedChild.id).not.toBe(child.id);
    expect(copiedOuter.parentId).toBeUndefined();
    expect(copiedInner.parentId).toBe(copiedOuter.id);
    expect(copiedChild.parentId).toBe(copiedInner.id);
    expect(inner.parentId).toBe(outer.id);
    expect(child.parentId).toBe(inner.id);
  });

  it("releases a copied child when its parent is not copied", () => {
    const track = makeTrack({ type: "video", name: "Video" });
    const parent = makeClip({
      trackId: track.id,
      name: "Uncopied group",
      mediaType: "group",
      startMs: 0,
      durationMs: 1000
    });
    const child = makeClip({
      trackId: track.id,
      name: "Child",
      parentId: parent.id,
      startMs: 100,
      durationMs: 500
    });

    const copied = copy([child], track);
    expect(copied).toHaveLength(1);
    expect(copied[0].parentId).toBeUndefined();
    expect(child.parentId).toBe(parent.id);
  });
});

describe("paste with a skipped group", () => {
  beforeEach(clearClipClipboard);

  it("releases an audio child when its group has no compatible target track", () => {
    const video = makeTrack({ type: "video", name: "Source video" });
    const audio = makeTrack({ type: "audio", name: "Source audio" });
    const group = makeClip({
      trackId: video.id,
      name: "Group",
      mediaType: "group",
      startMs: 0,
      durationMs: 1000
    });
    const child = makeClip({
      trackId: audio.id,
      name: "Audio child",
      mediaType: "audio",
      parentId: group.id,
      startMs: 0,
      durationMs: 1000
    });
    copyClipsToClipboard([group, child]);

    const target = makeTrack({ type: "audio", name: "Target audio" });
    const pasted = buildPastedClips([target], 10_000);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].name).toBe(child.name);
    expect(pasted[0].trackId).toBe(target.id);
    expect(pasted[0].parentId).toBeUndefined();
  });
});
