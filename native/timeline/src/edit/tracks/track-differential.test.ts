import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { makeClip, makeTrack, type TimelineTrack, type TimelineClip, type MediaTrack, type TimelineTempo } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../../../../../web/src/stores/timeline/TimelineStore.ts";
import { computeReorderedTrackIds } from "../../../../../web/src/components/timeline/Tracks/trackReorder.ts";
import { checkIds, inputIds, normalize } from "../../../scripts/conformance/normalize.ts";

const CASES = Number(process.env.NT_DIFF_CASES ?? 300);
type Doc = { tracks: TimelineTrack[]; clips: TimelineClip[]; mediaTracks: MediaTrack[]; tempo?: TimelineTempo; extra: string };
type Payload = Record<string, unknown>;
const TYPES = ["video", "audio", "overlay", "subtitle", "midi", "chord"] as const;

function rng(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}
function pick<T>(r: () => number, values: readonly T[]): T {
  return values[Math.floor(r() * values.length)];
}
function document(r: () => number, caseIndex: number): Doc {
  const tracks = [...TYPES, "video" as const].map((type, index) => makeTrack({
    id: `t${index}`, type, index: r() < 0.2 ? index + 10 : index,
    name: `${type} ${index}`, locked: r() < 0.2, muted: false, solo: false, heightPx: 64,
    effects: [{ id: `fx${index}`, type: "gain", enabled: true, gainDb: -3 }]
  }));
  const clips = tracks.flatMap((track, index) => [0, 1].map(part => makeClip({
    id: `c${index}-${part}`, trackId: track.id, name: `Clip ${index}`, startMs: index * 350,
    durationMs: 700, locked: r() < 0.1, mediaType: track.type === "audio" ? "audio" : track.type === "midi" ? "midi" : "video",
    ...(part === 0 || r() < 0.4 ? { linkId: `link${index % 3}` } : {})
  })));
  clips.push(makeClip({ id: "group", trackId: "t0", mediaType: "group" }));
  clips.push(makeClip({ id: "child", trackId: caseIndex % 2 ? "t0" : "t6", parentId: "group" }));
  clips.push(makeClip({ id: "bound", trackId: "t2", trackBinding: { trackId: "mt", mode: "position" } }));
  const mediaTracks: MediaTrack[] = [{ id: "mt", clipId: "c0-0", sourceAssetId: "asset", name: "Subject", kind: "point", sourceStartMs: 0, sourceEndMs: 700, samples: [], status: "ready" }];
  return { tracks, clips, mediaTracks, extra: "preserve me", ...(caseIndex % 2 ? { tempo: { bpm: 93, offsetMs: 12, timeSignature: { beatsPerBar: 3, beatUnit: 4 } } } : {}) };
}
function native(doc: Doc, action: string, payload: Payload): Doc {
  const binary = process.env.NT_TRACK_OPS;
  if (!binary) throw new Error("NT_TRACK_OPS is required");
  if (process.env.NT_OPS_COUNT_FILE) appendFileSync(process.env.NT_OPS_COUNT_FILE, "1\n");
  const result = JSON.parse(execFileSync(binary, [], { input: JSON.stringify({ action, doc, payload }), encoding: "utf8" }));
  if (result.error) throw new Error(result.error);
  return result;
}
function web(doc: Doc, action: string, payload: Payload): Doc {
  const store = createTimelineStore();
  store.setState({ ...structuredClone(doc), tempo: doc.tempo });
  const state = store.getState();
  const args = action === "addTrack" ? [payload.type, payload.name]
    : action === "insertTrack" ? [payload.type, payload.atIndex, payload.name]
    : action === "reorderTracks" ? [payload.orderedIds]
    : [payload.trackId, ...Object.entries(payload).filter(([key]) => key !== "trackId").map(([, value]) => value)];
  Reflect.apply(Reflect.get(state, action), state, args);
  const { tracks, clips, mediaTracks, tempo } = store.getState();
  return { ...doc, tracks, clips, mediaTracks, ...(tempo === undefined ? {} : { tempo }) };
}
// The shared normalizer recognizes id/linkId/parentId. Wrap track references
// as id fields so fresh track ids are checked together with their references.
function references(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(references);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === "trackId" ? { id: item } : references(item)]));
  return value;
}
const ACTIONS: Record<string, (r: () => number, doc: Doc, i: number) => Payload> = {
  addTrack: (r, _doc, i) => ({ type: TYPES[i % TYPES.length], ...(r() < 0.5 ? { name: " custom " } : {}) }),
  insertTrack: (r, doc, i) => ({ type: TYPES[i % TYPES.length], atIndex: pick(r, [-4, 0, 2, 3.8, doc.tracks.length + 4]), ...(r() < 0.5 ? { name: "" } : {}) }),
  duplicateTrack: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]) }),
  removeTrack: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]) }),
  reorderTracks: (r, doc) => ({ orderedIds: ["missing", ...doc.tracks.filter(() => r() < 0.7).reverse().map(t => t.id)] }),
  setTrackName: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), name: pick(r, ["", "  new name  ", "midi 4"]) }),
  setTrackHeight: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), heightPx: pick(r, [-5, 0, 64, 93.5, 1000]) }),
  setTrackVisible: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), visible: r() < 0.5 }),
  setTrackLocked: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), locked: r() < 0.5 }),
  setTrackMuted: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), muted: r() < 0.5 }),
  setTrackSolo: (r, doc) => ({ trackId: pick(r, [...doc.tracks.map(t => t.id), "missing"]), solo: r() < 0.5 })
};
function compare(doc: Doc, action: string, payload: Payload): boolean {
  const expected = web(doc, action, payload);
  const actual = native(doc, action, payload);
  expect(checkIds(actual.clips, doc.clips)).toEqual([]);
  const known = inputIds(doc);
  expect(normalize(references(actual), known), JSON.stringify({ action, payload, doc })).toEqual(normalize(references(expected), known));
  return JSON.stringify(expected) !== JSON.stringify(doc);
}
describe("native track actions against the web store", () => {
  for (const [action, payload] of Object.entries(ACTIONS)) {
    it(`${action}: ${CASES} randomized cases agree`, () => {
      const r = rng(action.length * 104729 + 3);
      let changed = 0;
      for (let i = 0; i < CASES; i++) {
        const doc = document(r, i);
        changed += Number(compare(doc, action, payload(r, doc, i)));
      }
      expect(changed).toBeGreaterThan(0);
    });
  }
  it("same-type drag before and after agrees", () => {
    const r = rng(712);
    for (let i = 0; i < CASES; i++) {
      const doc = document(r, i);
      const orderedIds = computeReorderedTrackIds(doc.tracks, i % 2 ? "t0" : "t6", i % 2 ? "t6" : "t0", i % 3 ? "before" : "after");
      if (orderedIds) compare(doc, "reorderTracks", { orderedIds });
    }
  });
  it("delete releases cross-track children, singleton links and media bindings", () => {
    const doc = document(rng(1), 0);
    doc.tracks = doc.tracks.map(t => ({ ...t, locked: false }));
    doc.clips = [
      makeClip({ id: "group", trackId: "t0", mediaType: "group" }),
      makeClip({ id: "kid", trackId: "t6", parentId: "group", linkId: "L" }),
      makeClip({ id: "c0-0", trackId: "t0", linkId: "L" }),
      makeClip({ id: "bound", trackId: "t6", trackBinding: { trackId: "mt", mode: "position" } })
    ];
    expect(compare(doc, "removeTrack", { trackId: "t0" })).toBe(true);
    expect(compare(doc, "duplicateTrack", { trackId: "t0" })).toBe(true);
    expect(compare(doc, "duplicateTrack", { trackId: "t6" })).toBe(true);
    doc.clips[1].locked = true;
    expect(compare(doc, "removeTrack", { trackId: "t0" })).toBe(false);
  });
});
