import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { makeClip, makeTrack, type TimelineClip, type MediaTrack } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../../../../../web/src/stores/timeline/TimelineStore.ts";
import { checkIds, inputIds, normalize } from "../../../scripts/conformance/normalize.ts";

const CASES = Number(process.env.NT_DIFF_CASES ?? 300);
type Doc = { tracks: ReturnType<typeof makeTrack>[]; clips: TimelineClip[]; mediaTracks: MediaTrack[]; extra: string };
type Payload = { clipId: string; selectedIds: string[]; deltaMs: number; linked: boolean; startMs: number; endMs: number; ripple: boolean; trackId: string; timeMs: number; mode: "insert"; maxSourceDurationMs?: number; untargetedTrackIds: string[]; syncLockOffTrackIds: string[] };
function rng(seed: number): () => number {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}
function pick<T>(r: () => number, values: readonly T[]): T { return values[Math.floor(r() * values.length)]; }
function document(r: () => number, i: number): Doc {
  const controlled = i % 4 === 0;
  const tracks = (["video", "video", "video", "audio", "audio", "audio"] as const).map((type, index) => makeTrack({
    id: `t${index}`, type, index, locked: !controlled && r() < 0.12
  }));
  const clips = tracks.flatMap((track, index) => [0, 1, 2].map(part => makeClip({
    id: `c${index}-${part}`, trackId: track.id, startMs: part === 0 ? 1000 : 3000 + part * 1000 + (controlled ? 0 : Math.floor(r() * 4) * 250),
    durationMs: part === 0 ? 1000 : 500 + Math.floor(r() * 4) * 250,
    inPointMs: 500, locked: !controlled && r() < 0.08,
    mediaType: track.type === "audio" ? "audio" : "video",
    ...(part === 0 && (index === 0 || index === 3) ? { linkId: "link" } : {})
  })));
  clips.push(makeClip({ id: "group", trackId: "t4", startMs: 8000, durationMs: 2000, mediaType: "group" }));
  clips.push(makeClip({ id: "child", trackId: "t4", parentId: "group", startMs: 8000, durationMs: 1000, mediaType: "audio" }));
  // This track has no clip blocking the delete span, so sync lock is observable.
  clips[6].startMs = 0;
  clips[6].durationMs = 500;
  clips[3].reframe = { trackId: "mt", mode: "track" };
  const mediaTracks: MediaTrack[] = [{ id: "mt", clipId: "c1-0", sourceAssetId: "asset", name: "Subject", kind: "point", sourceStartMs: 500, sourceEndMs: 1500,
    samples: i % 3 === 0 ? [] : [{ sourceMs: 500, x: 0, y: 1 }, { sourceMs: 1500, x: 1, y: 0, confidence: 0.9 }], status: "ready" }];
  return { tracks, clips, mediaTracks, extra: "preserve raw fields" };
}
function native(doc: Doc, action: string, payload: Payload): Doc {
  const binary = process.env.NT_TARGETING_OPS;
  if (!binary) { throw new Error("NT_TARGETING_OPS is required"); }
  if (process.env.NT_OPS_COUNT_FILE) { appendFileSync(process.env.NT_OPS_COUNT_FILE, "1\n"); }
  const nativePayload: Record<string, unknown> = { ...payload };
  // clipId is a builtin fallback for selectedIds, not a delete argument.
  if (action === "rippleDeleteSelected") { delete nativePayload.clipId; }
  const result = JSON.parse(execFileSync(binary, [], { input: JSON.stringify({ action, doc, payload: nativePayload }), encoding: "utf8" }));
  if (result.error) { throw new Error(result.error); }
  return result;
}
function web(doc: Doc, action: string, p: Payload): Doc {
  const store = createTimelineStore();
  store.setState({ ...structuredClone(doc), linkedSelection: p.linked,
    untargetedTrackIds: new Set(p.untargetedTrackIds), syncLockOffTrackIds: new Set(p.syncLockOffTrackIds) });
  const state = store.getState();
  if (action === "rippleTrimClipStart") { state.rippleTrimClipStart(p.clipId, p.deltaMs); }
  else if (action === "rippleTrimClipEnd") { state.rippleTrimClipEnd(p.clipId, p.deltaMs, p.maxSourceDurationMs); }
  else if (action === "rippleDeleteSelected") { state.rippleDeleteSelected(new Set(p.selectedIds)); }
  else if (action === "removeRange") { state.removeRange(p.startMs, p.endMs, p.ripple); }
  else if (action === "closeGapAt") { state.closeGapAt(p.trackId, p.timeMs); }
  else if (action === "resolveDropAction") { state.resolveDrop(new Set(p.selectedIds), p.mode); }
  else { throw new Error(`Unknown action ${action}`); }
  const { clips, mediaTracks } = store.getState();
  return { ...doc, clips, mediaTracks };
}
// Include fresh media-track ownership and reframe references in id normalization.
function references(value: unknown): unknown {
  if (Array.isArray(value)) { return value.map(references); }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "clipId" || key === "trackId" ? { id: item } : references(item)]));
  }
  return value;
}
describe("targeting edits against the web store", () => {
  for (const name of ["rippleTrimClipStart", "rippleTrimClipEnd", "rippleDeleteSelected", "lift", "extract", "closeGapAt", "resolveDropAction"]) {
    it(`${name}: ${CASES} cases agree and targeting changes results`, () => {
      const r = rng(name.length * 104729 + 17);
      let sensitive = 0;
      let mediaSplits = 0;
      for (let i = 0; i < CASES; i++) {
        const doc = document(r, i);
        const controlled = i % 4 === 0;
        const p: Payload = {
          clipId: controlled ? "c0-0" : pick(r, [...doc.clips.filter(c => c.mediaType !== "group").map(c => c.id), "missing"]),
          selectedIds: controlled ? ["c0-0"] : doc.clips.filter(c => c.mediaType !== "group" && r() < 0.15).map(c => c.id),
          deltaMs: controlled ? 250 : pick(r, [-1500, -250, 0, 250, 1500]), linked: controlled || r() < 0.5,
          startMs: controlled ? 1250 : pick(r, [0, 1000, 1250, 2000, 4000, 9000]), endMs: controlled ? 1750 : pick(r, [500, 1750, 2000, 5000, 9000]),
          ripple: name === "extract", trackId: controlled ? "t0" : pick(r, [...doc.tracks.map(t => t.id), "missing"]), timeMs: controlled ? 2500 : pick(r, [0, 1000, 2500, 4500, 12000]), mode: "insert",
          untargetedTrackIds: ["t2", "t5", ...doc.tracks.filter(t => !controlled && r() < 0.25).map(t => t.id)],
          syncLockOffTrackIds: ["t1", "t2", ...doc.tracks.filter(t => !controlled && r() < 0.25).map(t => t.id)],
          ...(r() < 0.5 ? { maxSourceDurationMs: 1750 } : {})
        };
        // Insert at a clip boundary: the native media-owner guard is tested in C++.
        if (name === "resolveDropAction") { p.selectedIds = ["c0-0"]; }
        const action = name === "lift" || name === "extract" ? "removeRange" : name;
        const known = inputIds(references(doc));
        const expected = web(doc, action, p);
        const plain = web(doc, action, { ...p, untargetedTrackIds: [], syncLockOffTrackIds: [] });
        if (JSON.stringify(normalize(references(expected), known)) !== JSON.stringify(normalize(references(plain), known))) { sensitive++; }
        if (expected.mediaTracks.length > doc.mediaTracks.length) { mediaSplits++; }
        const actual = native(doc, action, p);
        expect(normalize(references(actual), known), `${name} case ${i}: ${JSON.stringify({ doc, p })}`).toEqual(normalize(references(expected), known));
        expect(checkIds(actual.clips, doc.clips)).toEqual([]);
      }
      console.log(`${name}: ${CASES} cases, ${sensitive} differ without targeting, ${mediaSplits} split media tracks`);
      expect(sensitive).toBeGreaterThanOrEqual(Math.max(1, Math.floor(CASES / 10)));
      if (name === "lift" || name === "extract") { expect(mediaSplits).toBeGreaterThan(0); }
    });
  }
});
