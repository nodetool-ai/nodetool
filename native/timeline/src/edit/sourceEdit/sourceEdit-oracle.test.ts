import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../../../../../web/src/stores/timeline/TimelineStore";
import { createTimelineUIStore } from "../../../../../web/src/stores/timeline/TimelineUIStore";
import { performSourceEdit, type SourceEditKind } from "../../../../../web/src/components/timeline/sourceEdit";
import type { Asset } from "../../../../../web/src/stores/ApiTypes";
import { checkIds, inputIds, normalize } from "../../../scripts/conformance/normalize";

function rng(seed: number): () => number {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}
function pick<T>(r: () => number, values: readonly T[]): T { return values[Math.floor(r() * values.length)]; }
function cases(kind: SourceEditKind) {
  const r = rng(104729 + kind.length);
  return Array.from({ length: 300 }, (_, i) => {
    const content_type = pick(r, ["video/mp4", "audio/wav", "image/png", "text/plain", "model/gltf-binary", "application/octet-stream"]);
    // Only the persistence-independent fields used by the source viewer are needed.
    const asset = i % 31 === 0 ? undefined : { id: "source", name: i % 19 === 0 ? "take.glb" : "Source take", content_type,
      duration: pick(r, [undefined, null, 0, 1.2345, 4, 10]), metadata: { thumbnails: ["poster"] } } as unknown as Asset;
    const tracks = (["video", "overlay", "audio", "video", "audio", "subtitle", "midi"] as const).map((type, index) =>
      makeTrack({ id: `t${index}`, type, index: pick(r, [0, 1, 2, 3, 4]), locked: r() < 0.16 }));
    // Reverse array order so index sorting, including stable ties, matters.
    tracks.reverse();
    const clips = tracks.flatMap(track => Array.from({ length: i % 7 === 0 ? 0 : 3 }, (_, j) => makeClip({
      id: `${track.id}-c${j}`, trackId: track.id, mediaType: track.type === "audio" ? "audio" : "video",
      startMs: j * 2500, durationMs: pick(r, [500, 2000, 4000]), inPointMs: 200,
      locked: r() < 0.12, ...(j === 1 && r() < 0.2 ? { linkId: "linked" } : {}),
      name: "Existing", opacity: 0.7
    })));
    const sourceRange = i % 3 === 0 ? null : { assetId: i % 3 === 1 ? "source" : "other",
      inMs: pick(r, [-500, 0, 350, 2000, 20000]), outMs: pick(r, [-200, 0, 1000, 5000, 30000]) };
    if (i % 15 === 0) {
      const owner = makeClip({ id: "owned", trackId: "v", mediaType: "video", startMs: 1000, durationMs: 4000, inPointMs: 0 });
      return { kind, doc: { tracks: [makeTrack({ id: "v", type: "video", index: 0 })], clips: [owner],
        mediaTracks: [{ id: "subject", clipId: owner.id, sourceAssetId: "existing", name: "Subject", kind: "point" as const,
          sourceStartMs: 0, sourceEndMs: 4000, samples: [], status: "ready" as const }], extra: { preserve: true } },
        // Only source-viewer fields are needed from the persisted Asset shape.
        asset: { id: "source", name: "Source take", content_type: "video/mp4", duration: 6 } as unknown as Asset,
        sourceRange: { assetId: "source", inMs: 0, outMs: i % 30 === 0 ? 6000 : 2000 },
        playheadMs: kind === "overwrite" && i % 30 === 0 ? 1000 : 2000,
        untargetedTrackIds: [], syncLockOffTrackIds: [] };
    }
    return { kind, doc: { tracks, clips, mediaTracks: [], extra: { preserve: true } }, asset, sourceRange,
      playheadMs: pick(r, [0, 250, 1500, 2500, 6000, 15000]),
      untargetedTrackIds: tracks.filter(() => r() < 0.3).map(t => t.id),
      syncLockOffTrackIds: tracks.filter(() => r() < 0.3).map(t => t.id) };
  });
}

describe("source edits against sourceEdit.ts and the real web store", () => {
  for (const kind of ["append", "insert", "overwrite"] as const) {
    it(`${kind}: 300 seeded cases match every raw clip field and returned id`, () => {
      const requests = cases(kind);
      const binary = process.env.NT_SOURCEEDIT_OPS;
      if (!binary) { throw new Error("NT_SOURCEEDIT_OPS is required"); }
      const directory = mkdtempSync(join(tmpdir(), "sourceedit-oracle-"));
      const inputPath = join(directory, "cases.json");
      writeFileSync(inputPath, JSON.stringify(requests));
      const input = openSync(inputPath, "r");
      let actual: Array<{ doc: typeof requests[number]["doc"]; id: string | null }>;
      try {
        actual = JSON.parse(execFileSync(binary, [], {
          stdio: [input, "pipe", "pipe"], encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024
        }));
      } finally { closeSync(input); rmSync(directory, { recursive: true, force: true }); }
      expect(actual).toHaveLength(requests.length);
      let successful = 0;
      let refused = 0;
      let mediaTrackOwnerDifferences = 0;
      requests.forEach((request, i) => {
        const store = createTimelineStore();
        store.setState({ ...structuredClone(request.doc), untargetedTrackIds: new Set(request.untargetedTrackIds),
          syncLockOffTrackIds: new Set(request.syncLockOffTrackIds) });
        let addedClips: typeof request.doc.clips | undefined;
        const resolveDrop = store.getState().resolveDrop;
        store.setState({ resolveDrop: (ids, mode) => {
          addedClips = structuredClone(store.getState().clips);
          resolveDrop(ids, mode);
        } });
        const ui = createTimelineUIStore();
        ui.getState().setSourceRange(request.sourceRange);
        const id = performSourceEdit(kind, { doc: store.getState(), ui: ui.getState(), asset: request.asset, playheadMs: request.playheadMs });
        if (id) { successful++; } else { refused++; }
        let expected = { doc: { ...request.doc, clips: store.getState().clips }, id };
        const strandsMediaTrackOwner = kind !== "append" && request.doc.mediaTracks.some(mediaTrack => {
          const before = request.doc.clips.find(c => c.id === mediaTrack.clipId);
          const after = expected.doc.clips.find(c => c.id === mediaTrack.clipId);
          return before && (!after || before.startMs !== after.startMs ||
            before.durationMs !== after.durationMs || before.inPointMs !== after.inPointMs);
        });
        if (strandsMediaTrackOwner) {
          // DESIGN.md D4 item 4: native drops refuse to split/remove a media-track owner.
          // The web still strands that data. Native retains addSourceRange as an overlap.
          mediaTrackOwnerDifferences++;
          expect(addedClips).toBeDefined();
          if (!addedClips) { throw new Error("Source edit did not reach drop resolution"); }
          expected = { doc: { ...request.doc, clips: addedClips }, id };
        }
        const known = inputIds(request.doc);
        expect(normalize(actual[i], known), `case ${i}: ${JSON.stringify(request)}`).toEqual(normalize(expected, known));
        expect(checkIds(actual[i].doc.clips, request.doc.clips)).toEqual([]);
      });
      expect(successful).toBeGreaterThan(20);
      expect(refused).toBeGreaterThan(20);
      if (kind === "append") { expect(mediaTrackOwnerDifferences).toBe(0); }
      else {
        expect(mediaTrackOwnerDifferences).toBeGreaterThan(0);
        expect(mediaTrackOwnerDifferences).toBeLessThan(requests.length / 4);
      }
      process.stdout.write(`${kind}: ${successful} edits, ${refused} refusals, ${mediaTrackOwnerDifferences} known media-track-owner differences\n`);
    });
  }
});

it("overwrite preserves a covered media-track owner as the documented D4 item 4 difference", () => {
  const doc = {
    tracks: [makeTrack({ id: "v", type: "video", index: 0 })],
    clips: [makeClip({ id: "owned", trackId: "v", mediaType: "video", startMs: 1000, durationMs: 2000 })],
    mediaTracks: [{ id: "subject", clipId: "owned", sourceAssetId: "existing-asset", name: "Subject",
      kind: "point" as const, sourceStartMs: 0, sourceEndMs: 2000, samples: [], status: "ready" as const }]
  };
  // Only source-viewer fields are needed from the persisted Asset shape.
  const asset = { id: "source", name: "New take", content_type: "video/mp4", duration: 2 } as unknown as Asset;
  const sourceRange = { assetId: asset.id, inMs: 0, outMs: 2000 };
  const request = { kind: "overwrite" as const, doc, asset, sourceRange, playheadMs: 1000, untargetedTrackIds: [] };
  const store = createTimelineStore();
  store.setState(structuredClone(doc));
  let addedClips: typeof doc.clips | undefined;
  const resolveDrop = store.getState().resolveDrop;
  store.setState({ resolveDrop: (ids, mode) => {
    addedClips = structuredClone(store.getState().clips);
    resolveDrop(ids, mode);
  } });
  const ui = createTimelineUIStore();
  ui.getState().setSourceRange(sourceRange);
  const id = performSourceEdit("overwrite", { doc: store.getState(), ui: ui.getState(), asset, playheadMs: 1000 });
  expect(id).not.toBeNull();
  expect(store.getState().clips.some(c => c.id === "owned")).toBe(false);
  // DESIGN.md D4 item 4: refuse drop resolution, retaining the source range as an overlap.
  expect(addedClips).toBeDefined();
  if (!addedClips) { throw new Error("Source edit did not reach drop resolution"); }
  expect(addedClips.some(c => c.id === "owned")).toBe(true);
  const binary = process.env.NT_SOURCEEDIT_OPS;
  if (!binary) { throw new Error("NT_SOURCEEDIT_OPS is required"); }
  const directory = mkdtempSync(join(tmpdir(), "sourceedit-owner-"));
  const inputPath = join(directory, "case.json");
  writeFileSync(inputPath, JSON.stringify(request));
  const input = openSync(inputPath, "r");
  try {
    const actual: unknown = JSON.parse(execFileSync(binary, [], {
      stdio: [input, "pipe", "pipe"], encoding: "utf8", timeout: 10000
    }));
    const expected = { doc: { ...doc, clips: addedClips }, id };
    expect(normalize(actual, inputIds(doc))).toEqual(normalize(expected, inputIds(doc)));
  } finally { closeSync(input); rmSync(directory, { recursive: true, force: true }); }
});
