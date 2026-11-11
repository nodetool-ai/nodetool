/**
 * The native editor keys parameters through a clip's `paramCurves`. Web has no
 * rows for them and draws the static values, and it must not lose them or leave
 * them wrong: through a load and a save, and through the edits it does offer.
 */

import { timeline } from "@nodetool-ai/protocol/api-schemas";
import { makeClip, splitClip, type ClipParamCurve, type TimelineClip, type TimelineSequence } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";
import { buildTimelineDocumentPayload } from "../../../hooks/timeline/timelineDocumentPayload";
import { attributePatch } from "../pasteAttributes";

const curve = (property: string, value = 1): ClipParamCurve => ({
  property,
  keyframes: [{ t: 0, value }, { t: 1, value: value + 1 }]
});

const clip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "c",
    trackId: "v",
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    currentAssetId: "asset-1",
    ...overrides
  });

const names = (owner?: Pick<TimelineClip, "paramCurves">) =>
  owner?.paramCurves?.map((c) => c.property);

describe("a clip's paramCurves in the web store", () => {
  it("come through a load and a save unchanged", () => {
    const paramCurves = [curve("volumeDb"), curve("effect:e:radius"), curve("future:thing")];
    const bypassedFixedEffects = { volume: { volumeDb: -6, curves: [curve("volumeDb")] } };
    const parsed = timeline.timelineDocument.parse(
      JSON.parse(
        JSON.stringify({
          tracks: [{ id: "v", name: "V", type: "video", index: 0, visible: true, locked: false }],
          clips: [clip({ paramCurves, bypassedFixedEffects })],
          markers: []
        })
      )
    );
    const store = createTimelineStore();
    store.getState().loadSequence({
      id: "seq-1",
      projectId: "proj-1",
      name: "Test",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 1000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...parsed
    } as TimelineSequence);
    expect(store.getState().clips[0].paramCurves).toEqual(paramCurves);
    const saved = timeline.timelineDocument.parse(
      JSON.parse(JSON.stringify(buildTimelineDocumentPayload(store.getState())))
    );
    expect(saved.clips[0]).toMatchObject({ paramCurves, bypassedFixedEffects });
  });

  it("lose an effect's keys when patchClip removes the effect, and undo brings them back", () => {
    const store = createTimelineStore();
    store.setState({
      clips: [
        clip({
          effects: [
            { id: "a", type: "blur", enabled: true, radius: 4 },
            { id: "b", type: "blur", enabled: true, radius: 2 }
          ] as TimelineClip["effects"],
          paramCurves: [curve("effect:a:radius"), curve("effect:b:radius"), curve("volumeDb")]
        })
      ]
    });
    const removeA = store.getState().clips[0].effects?.filter((e) => e.id !== "a");
    store.getState().patchClip("c", { effects: removeA });
    expect(names(store.getState().clips[0])).toEqual(["effect:b:radius", "volumeDb"]);
    store.getState().patchClip("c", { effects: [] });
    expect(names(store.getState().clips[0])).toEqual(["volumeDb"]);
  });

  it("are left alone by a patch that does not touch effects", () => {
    const store = createTimelineStore();
    const paramCurves = [curve("effect:gone:radius")];
    store.setState({ clips: [clip({ paramCurves })] });
    store.getState().patchClip("c", { name: "Renamed" });
    expect(store.getState().clips[0].paramCurves).toBe(paramCurves);
  });

  it("drop the field when the last curve goes", () => {
    const store = createTimelineStore();
    store.setState({
      clips: [
        clip({
          effects: [{ id: "a", type: "blur", enabled: true, radius: 4 }] as TimelineClip["effects"],
          paramCurves: [curve("effect:a:radius")]
        })
      ]
    });
    store.getState().patchClip("c", { effects: [] });
    expect("paramCurves" in store.getState().clips[0]).toBe(false);
  });

  it("rejoin when a split is merged back", () => {
    const store = createTimelineStore();
    const [left, right] = splitClip(
      clip({ paramCurves: [{ property: "volumeDb", keyframes: [{ t: 0, value: 0 }, { t: 1, value: -10 }] }] }),
      400
    );
    store.setState({ clips: [left, right] });
    store.getState().mergeClipsAt(400);
    const merged = store.getState().clips;
    expect(merged).toHaveLength(1);
    const keys = merged[0].paramCurves?.[0].keyframes;
    expect(keys?.[0]).toMatchObject({ t: 0, value: 0 });
    expect(keys?.at(-1)).toMatchObject({ t: 1, value: -10 });
    expect(keys?.find((k) => Math.abs(k.t - 0.4) < 1e-9)?.value).toBeCloseTo(-4);
  });
});

describe("Paste Attributes and paramCurves", () => {
  const source = clip({
    id: "s",
    effects: [{ id: "a", type: "blur", enabled: true }] as TimelineClip["effects"],
    paramCurves: [curve("effect:a:radius"), curve("depthPx"), curve("volumeDb", -6)]
  });
  const target = clip({
    id: "t",
    effects: [{ id: "b", type: "blur", enabled: true }] as TimelineClip["effects"],
    paramCurves: [curve("effect:b:radius"), curve("volumeDb", -9)]
  });

  it("moves an effect's keys with the effects", () => {
    expect(names(attributePatch(source, target, new Set(["effects"])))).toEqual([
      "volumeDb",
      "effect:a:radius"
    ]);
  });

  it("moves picture keys with the animations, and leaves effect and volume keys", () => {
    expect(names(attributePatch(source, target, new Set(["animations"])))).toEqual([
      "effect:b:radius",
      "volumeDb",
      "depthPx"
    ]);
  });

  it("moves volume keys with the volume, onto a sound clip", () => {
    const sound = clip({ id: "a", mediaType: "audio" });
    expect(names(attributePatch(source, sound, new Set(["volume"])))).toEqual(["volumeDb"]);
  });

  it("clears the field when nothing is left", () => {
    const patch = attributePatch(clip({ id: "s" }), clip({ id: "t", paramCurves: [curve("volumeDb")] }), new Set(["volume"]));
    expect("paramCurves" in patch).toBe(true);
    expect(patch.paramCurves).toBeUndefined();
  });

  it("adds nothing to a document with no curves", () => {
    expect("paramCurves" in attributePatch(clip({ id: "s" }), clip({ id: "t" }), new Set(["effects"]))).toBe(false);
  });
});
