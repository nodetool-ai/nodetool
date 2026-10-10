import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip, createMidiNote, makeTrack } from "@nodetool-ai/timeline";
import type { MediaTrack, TimelineClip } from "@nodetool-ai/timeline";

function storeWith(clips: TimelineClip[], lockedTrack = false) {
  const store = createTimelineStore();
  store.setState({
    tracks: [
      makeTrack({ id: "v", type: "video", name: "V", index: 0 }),
      makeTrack({
        id: "a",
        type: "audio",
        name: "A",
        index: 1,
        locked: lockedTrack
      }),
      makeTrack({ id: "v2", type: "video", name: "V2", index: 2 })
    ],
    clips,
    linkedSelection: true
  });
  const clip = (id: string) => {
    const found = store.getState().clips.find((c) => c.id === id);
    if (!found) throw new Error(`no clip ${id}`);
    return found;
  };
  return { store, clip };
}

const media = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    trackId: "v",
    mediaType: "video",
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    status: "generated",
    ...over
  });

describe("moveSelectedClips clamps the whole move unit at t=0", () => {
  it("keeps a J-cut offset when only the video is selected", () => {
    const { store, clip } = storeWith([
      media({ id: "vid", startMs: 1000, linkId: "L" }),
      media({ id: "aud", trackId: "a", mediaType: "audio", startMs: 500, linkId: "L" })
    ]);
    store.getState().moveSelectedClips("vid", new Set(["vid"]), -1000);
    expect(clip("aud").startMs).toBe(0);
    expect(clip("vid").startMs).toBe(500);
  });

  it("keeps a carried group child's offset", () => {
    const { store, clip } = storeWith([
      media({ id: "grp", mediaType: "group", startMs: 1000 }),
      media({ id: "kid", trackId: "v2", parentId: "grp", startMs: 400 })
    ]);
    store.getState().moveSelectedClips("grp", new Set(["grp"]), -1000);
    expect(clip("kid").startMs).toBe(0);
    expect(clip("grp").startMs).toBe(600);
  });
});

describe("moving a group carries its children's linked partners", () => {
  const clips = () => [
    media({ id: "grp", mediaType: "group", startMs: 1000 }),
    media({ id: "kid", trackId: "v2", parentId: "grp", startMs: 1000, linkId: "L" }),
    media({ id: "aud", trackId: "a", mediaType: "audio", startMs: 1000, linkId: "L" })
  ];

  it("in moveSelectedClips", () => {
    const { store, clip } = storeWith(clips());
    store.getState().moveSelectedClips("grp", new Set(["grp"]), 500);
    expect(clip("kid").startMs).toBe(1500);
    expect(clip("aud").startMs).toBe(1500);
  });

  it("in moveClip", () => {
    const { store, clip } = storeWith(clips());
    store.getState().moveClip("grp", 500);
    expect(clip("kid").startMs).toBe(1500);
    expect(clip("aud").startMs).toBe(1500);
  });
});

describe("setClipSpeed", () => {
  it("keeps the source window and scales the duration", () => {
    const { store, clip } = storeWith([
      media({ id: "vid", startMs: 0, durationMs: 4000, outPointMs: 4000 })
    ]);
    store.getState().setClipSpeed("vid", 2);
    expect(clip("vid").speedMultiplier).toBe(2);
    expect(clip("vid").durationMs).toBe(2000);
    expect(clip("vid").inPointMs).toBe(0);
    expect(clip("vid").outPointMs).toBe(4000);
  });

  it("applies the same speed to linked partners", () => {
    const { store, clip } = storeWith([
      media({ id: "vid", startMs: 0, durationMs: 4000, outPointMs: 4000, linkId: "L" }),
      media({
        id: "aud",
        trackId: "a",
        mediaType: "audio",
        startMs: 0,
        durationMs: 4000,
        outPointMs: 4000,
        linkId: "L"
      })
    ]);
    store.getState().setClipSpeed("vid", 2);
    expect(clip("aud").speedMultiplier).toBe(2);
    expect(clip("aud").durationMs).toBe(2000);
  });

  it("refuses when a linked partner sits on a locked track", () => {
    const { store, clip } = storeWith(
      [
        media({ id: "vid", startMs: 0, durationMs: 4000, outPointMs: 4000, linkId: "L" }),
        media({ id: "aud", trackId: "a", mediaType: "audio", startMs: 0, linkId: "L" })
      ],
      true
    );
    store.getState().setClipSpeed("vid", 2);
    expect(clip("vid").speedMultiplier).toBeUndefined();
    expect(clip("vid").durationMs).toBe(4000);
  });

  it("caps a slowed clip at the next clip and moves the out point", () => {
    const { store, clip } = storeWith([
      media({ id: "vid", startMs: 0, durationMs: 2000, outPointMs: 2000 }),
      media({ id: "next", startMs: 3000 })
    ]);
    store.getState().setClipSpeed("vid", 0.5);
    expect(clip("vid").durationMs).toBe(3000);
    expect(clip("vid").outPointMs).toBe(1500);
  });
});

describe("removeTrack", () => {
  it("refuses a locked track", () => {
    const { store } = storeWith(
      [media({ id: "aud", trackId: "a", mediaType: "audio", startMs: 0 })],
      true
    );
    expect(store.getState().removeTrack("a")).toBe(false);
    expect(store.getState().tracks).toHaveLength(3);
    expect(store.getState().clips).toHaveLength(1);
  });

  it("refuses a track holding a locked clip", () => {
    const { store } = storeWith([
      media({ id: "vid", startMs: 0, locked: true })
    ]);
    expect(store.getState().removeTrack("v")).toBe(false);
    expect(store.getState().clips).toHaveLength(1);
  });

  it("cleans links, parents, media tracks and track indices", () => {
    const { store, clip } = storeWith([
      media({ id: "grp", mediaType: "group", startMs: 0 }),
      media({ id: "kid", trackId: "v2", parentId: "grp", startMs: 0, linkId: "L" }),
      media({ id: "vid", startMs: 3000, linkId: "L" }),
      media({
        id: "bound",
        trackId: "v2",
        startMs: 5000,
        trackBinding: { trackId: "mt1", mode: "position" }
      })
    ]);
    store.setState({
      mediaTracks: [
        { id: "mt1", clipId: "vid" } as MediaTrack,
        { id: "mt2", clipId: "kid" } as MediaTrack
      ]
    });
    expect(store.getState().removeTrack("v")).toBe(true);
    expect(clip("kid").parentId).toBeUndefined();
    expect(clip("kid").linkId).toBeUndefined();
    expect(clip("bound").trackBinding).toBeUndefined();
    expect(store.getState().mediaTracks.map((t) => t.id)).toEqual(["mt2"]);
    expect(store.getState().tracks.map((t) => [t.id, t.index])).toEqual([
      ["a", 0],
      ["v2", 1]
    ]);
  });
});

describe("groupClips", () => {
  it("leaves locked members out and refuses when fewer than two remain", () => {
    const { store, clip } = storeWith([
      media({ id: "one", startMs: 0 }),
      media({ id: "two", trackId: "v2", startMs: 0, locked: true })
    ]);
    expect(store.getState().groupClips(new Set(["one", "two"]))).toBeNull();
    expect(clip("one").parentId).toBeUndefined();
    expect(clip("two").parentId).toBeUndefined();
    expect(store.getState().clips).toHaveLength(2);
  });

  it("groups only the editable members", () => {
    const { store, clip } = storeWith([
      media({ id: "one", startMs: 0 }),
      media({ id: "two", trackId: "v2", startMs: 1000 }),
      media({ id: "three", trackId: "v2", startMs: 4000, locked: true })
    ]);
    const groupId = store.getState().groupClips(new Set(["one", "two", "three"]));
    expect(groupId).not.toBeNull();
    expect(clip("one").parentId).toBe(groupId);
    expect(clip("two").parentId).toBe(groupId);
    expect(clip("three").parentId).toBeUndefined();
    const group = clip(groupId!);
    expect(group.startMs).toBe(0);
    expect(group.durationMs).toBe(3000);
    expect(group.trackId).toBe("v");
  });
});

describe("quantizeClip follows the grid phase", () => {
  it("snaps to the grid anchored at tempo.offsetMs", () => {
    // 120 BPM: a quarter is 500 ms and 960 ticks. A 250 ms offset puts the
    // quarter grid at ticks 480, 1440, ... of the clip content.
    const { store, clip } = storeWith([
      media({
        id: "m",
        trackId: "v",
        mediaType: "midi",
        startMs: 0,
        inPointMs: 0,
        notes: [createMidiNote({ id: "n", pitch: 60, startTick: 400, durationTick: 100 })]
      })
    ]);
    store.setState({
      tempo: { bpm: 120, offsetMs: 250, timeSignature: { beatsPerBar: 4, beatUnit: 4 } }
    });
    store.getState().quantizeClip("m", { division: "1/4" });
    expect(clip("m").notes?.[0].startTick).toBe(480);
  });
});

describe("splitting a clip reslices its media tracks", () => {
  it("gives each half its own track and points its reframe at it", () => {
    const { store } = storeWith([
      media({
        id: "vid",
        startMs: 0,
        durationMs: 4000,
        outPointMs: 4000,
        reframe: { mode: "track", trackId: "mt1" }
      })
    ]);
    const track: MediaTrack = {
      id: "mt1",
      clipId: "vid",
      sourceAssetId: "asset",
      name: "Subject",
      kind: "point",
      sourceStartMs: 0,
      sourceEndMs: 4000,
      samples: [
        { sourceMs: 0, x: 0.1, y: 0.1 },
        { sourceMs: 4000, x: 0.9, y: 0.9 }
      ],
      status: "ready"
    };
    store.setState({ mediaTracks: [track] });
    store.getState().splitClipAtTime("vid", 2000);

    const { clips, mediaTracks } = store.getState();
    expect(clips).toHaveLength(2);
    expect(mediaTracks).toHaveLength(2);
    for (const half of clips) {
      const own = mediaTracks.filter((t) => t.clipId === half.id);
      expect(own).toHaveLength(1);
      expect(half.reframe?.trackId).toBe(own[0].id);
    }
  });
});
