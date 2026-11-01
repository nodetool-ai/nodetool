/**
 * Randomized differential of the editor's clip actions: the web store's own
 * actions (web/src/stores/timeline/TimelineStore.ts, run in this process)
 * against the native EditActions (`timeline-ops`, fn "storeAction"). The
 * same random documents and calls; the clip arrays must be deep-equal once
 * fresh ids are renamed in order of appearance.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { checkIds, inputIds, normalize } from "./normalize.ts";
import { createTimelineStore } from "../../../../web/src/stores/timeline/TimelineStore.ts";
import { planSlip } from "../../../../web/src/components/timeline/Tracks/useClipSourceSlip.ts";

const CASES = Number(process.env.NT_DIFF_CASES ?? 300);
const bin = process.env.NT_TIMELINE_OPS!;

function native(state: unknown, action: string, ...params: unknown[]): any {
  if (process.env.NT_OPS_COUNT_FILE) appendFileSync(process.env.NT_OPS_COUNT_FILE, "1\n");
  const out = execFileSync(bin, [], {
    input: JSON.stringify({ fn: "storeAction", args: [state, action, ...params] }),
    encoding: "utf8"
  });
  const response = JSON.parse(out);
  if ("error" in response) throw new Error(response.error);
  return response.result;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const TRACKS = [
  { id: "v1", type: "video" },
  { id: "v2", type: "video" },
  { id: "a1", type: "audio" }
];

function makeDoc(r: () => number) {
  const tracks = TRACKS.map((t, index) => ({
    ...t,
    name: t.id,
    index,
    visible: true,
    muted: false,
    locked: r() < 0.15
  }));
  const n = 2 + Math.floor(r() * 9);
  const clips: any[] = [];
  for (let i = 0; i < n; i++) {
    const track = tracks[Math.floor(r() * tracks.length)];
    const durationMs = 250 + Math.round(r() * 10) * 250;
    const c: any = {
      id: `c${i}`,
      trackId: track.id,
      name: `clip ${i}`,
      startMs: Math.round(r() * 20) * 250,
      durationMs,
      mediaType: track.type === "audio" ? "audio" : r() < 0.2 ? "image" : "video",
      sourceType: "imported",
      status: "generated",
      locked: r() < 0.1,
      versions: [],
      extra: { kept: i }
    };
    if (r() < 0.6) c.inPointMs = Math.round(r() * 4) * 250;
    if (r() < 0.4) c.outPointMs = (c.inPointMs ?? 0) + durationMs;
    if (r() < 0.2) c.fadeInMs = 200;
    if (r() < 0.2) c.fadeOutMs = 200;
    if (i > 0 && r() < 0.4) {
      c.trackId = clips[i - 1].trackId;
      c.mediaType = clips[i - 1].mediaType;
      c.startMs = clips[i - 1].startMs + clips[i - 1].durationMs;
    }
    clips.push(c);
  }
  // A group with a child after it: a ripple moves both (D4 groups). The
  // group itself is never an action's target here: the native editor
  // refuses group targets (moveGroup, trimGroup and ungroup are not ported).
  if (r() < 0.4) {
    const start = Math.round(r() * 12) * 250;
    clips.push({ id: "grp", trackId: "v2", name: "group", startMs: start, durationMs: 2000, mediaType: "group",
      sourceType: "imported", status: "generated", locked: false, versions: [] });
    clips.push({ id: "grpChild", trackId: "v1", name: "child", startMs: start, durationMs: 1000, mediaType: "video",
      sourceType: "imported", status: "generated", locked: false, versions: [], parentId: "grp" });
  }
  // A video and its audio, linked.
  if (r() < 0.6) {
    const v = clips.find((c) => c.trackId !== "a1");
    if (v) {
      v.linkId = "L1";
      clips.push({ ...v, id: "linkedAudio", trackId: "a1", mediaType: "audio", linkId: "L1", locked: false });
      // A partner with less source before it: a slip can run it out (planSlip).
      if (r() < 0.3) clips[clips.length - 1].inPointMs = Math.round(r() * 2) * 125;
    }
  }
  return { clips, tracks, linkedSelection: r() < 0.8 };
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

const targets = (doc: any) => doc.clips.filter((c: any) => c.mediaType !== "group");

type Call = { action: string; params: unknown[] };

const ACTIONS: Record<string, (r: () => number, doc: any) => Call> = {
  moveClip: (r, doc) => ({
    action: "moveClip",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 20) * 250, r() < 0.3 ? pick(r, TRACKS).id : undefined]
  }),
  moveSelectedClips: (r, doc) => {
    const selected = targets(doc).filter(() => r() < 0.4).map((c: any) => c.id);
    const primary = selected.length && r() < 0.8 ? pick(r, selected) : pick(r, targets(doc)).id;
    return {
      action: "moveSelectedClips",
      params: [primary, selected, Math.round((r() - 0.5) * 20) * 250, r() < 0.3 ? pick(r, TRACKS).id : undefined]
    };
  },
  trimClipStart: (r, doc) => ({
    action: "trimClipStart",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 12) * 250]
  }),
  trimClipEnd: (r, doc) => ({
    action: "trimClipEnd",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 12) * 250, r() < 0.5 ? 2000 + Math.round(r() * 8) * 250 : undefined]
  }),
  rippleTrimClipStart: (r, doc) => ({
    action: "rippleTrimClipStart",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 12) * 250]
  }),
  rippleTrimClipEnd: (r, doc) => ({
    action: "rippleTrimClipEnd",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 12) * 250, r() < 0.5 ? 3000 : undefined]
  }),
  rollClipEdge: (r, doc) => ({
    action: "rollClipEdge",
    params: [pick(r, targets(doc)).id, r() < 0.5 ? "start" : "end", Math.round((r() - 0.5) * 8) * 250, undefined]
  }),
  deleteSelected: (r, doc) => ({
    action: "deleteSelected",
    params: [targets(doc).filter(() => r() < 0.35).map((c: any) => c.id)]
  }),
  rippleDeleteSelected: (r, doc) => ({
    action: "rippleDeleteSelected",
    params: [targets(doc).filter(() => r() < 0.35).map((c: any) => c.id)]
  }),
  splitClipAtTime: (r, doc) => {
    const c = pick(r, targets(doc));
    return { action: "splitClipAtTime", params: [c.id, c.startMs + Math.round(r() * c.durationMs)] };
  },
  splitSelectedAtPlayhead: (r, doc) => ({
    action: "splitSelectedAtPlayhead",
    params: [Math.round(r() * 24) * 250, targets(doc).filter(() => r() < 0.3).map((c: any) => c.id)]
  }),
  rateStretchClip: (r, doc) => {
    const c = pick(r, targets(doc));
    return { action: "rateStretchClip", params: [c.id, r() < 0.5 ? "start" : "end", c.durationMs * (0.2 + r() * 3)] };
  },
  slideClip: (r, doc) => {
    // Source lengths for some clips, as useClipSourceDuration reports them.
    const sources: Record<string, number> = {};
    for (const c of doc.clips) if (r() < 0.4) sources[c.id] = (c.outPointMs ?? (c.inPointMs ?? 0) + c.durationMs) + Math.round(r() * 4) * 250;
    return { action: "slideClip", params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 16) * 125, sources] };
  },
  planSlip: (r, doc) => ({
    action: "planSlip",
    params: [pick(r, targets(doc)).id, Math.round((r() - 0.5) * 16) * 125, r() < 0.5 ? 2000 + Math.round(r() * 12) * 250 : undefined]
  }),
  resolveDrop: (r, doc) => ({
    action: "resolveDrop",
    params: [targets(doc).filter(() => r() < 0.3).map((c: any) => c.id), pick(r, ["overwrite", "insert", "overlap"])]
  })
};

// The web call: Sets where the store takes them.
const SET_PARAMS: Record<string, number[]> = {
  moveSelectedClips: [1],
  deleteSelected: [0],
  rippleDeleteSelected: [0],
  splitSelectedAtPlayhead: [1],
  resolveDrop: [0]
};

function webCall(doc: any, call: Call): any {
  if (call.action === "planSlip") {
    const [id, delta, sourceMs] = call.params as [string, number, number | undefined];
    const state = { clips: structuredClone(doc.clips), tracks: doc.tracks, linkedSelection: doc.linkedSelection };
    return planSlip(state as any, state.clips.find((c: any) => c.id === id), delta, sourceMs);
  }
  if (call.action === "slideClip") {
    const [id, delta, sources] = call.params as [string, number, Record<string, number>];
    call = { action: "slideClip", params: [id, delta, (c: any) => sources[c.id]] };
  }
  const store = createTimelineStore();
  store.setState({ clips: structuredClone(doc.clips), tracks: doc.tracks, linkedSelection: doc.linkedSelection } as any);
  const params = call.params.map((p, i) => ((SET_PARAMS[call.action] ?? []).includes(i) ? new Set(p as string[]) : p));
  const ret = (store.getState() as any)[call.action](...params);
  const clips = store.getState().clips;
  return call.action === "splitSelectedAtPlayhead" ? { clips, rightHalfIds: ret } : clips;
}

describe("native clip actions against the web store", () => {
  for (const name of Object.keys(ACTIONS)) {
    it(`${name}: ${CASES} random cases agree`, () => {
      const r = rng(name.length * 104729 + 3);
      let changed = 0;
      for (let i = 0; i < CASES; i++) {
        const doc = makeDoc(r);
        const call = ACTIONS[name](r, doc);
        const known = inputIds(doc.clips);
        const expected = normalize(webCall(doc, call), known);
        const rawActual = native(doc, call.action, ...call.params.map((p) => p ?? null));
        const actual = normalize(rawActual, known);
        expect(actual, `${name} case ${i}: ${JSON.stringify({ doc, call })}`).toEqual(expected);
        if (call.action !== "planSlip") expect(checkIds((rawActual as any).clips ?? rawActual, doc.clips)).toEqual([]);
        const expectedClips = (expected as any)?.clips ?? expected;
        if (call.action === "planSlip") {
          if (expected !== null) changed += 1;
          continue;
        }
        if (JSON.stringify(expectedClips) !== JSON.stringify(normalize(doc.clips, known))) changed += 1;
      }
      console.log(`${name}: ${CASES} cases, ${changed} changed the document`);
      expect(changed).toBeGreaterThan(0);
    });
  }
});
