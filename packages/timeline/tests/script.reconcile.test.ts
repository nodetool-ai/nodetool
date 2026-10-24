import { describe, it, expect } from "vitest";
import type {
  ScriptLine,
  ScriptSection,
  Take
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import {
  buildScriptTimeline,
  reconcileScriptClips,
  type ScriptAssemblyInput
} from "../src/script.js";
import { makeClip, makeTrack } from "../src/defaults.js";

const take = (id: string, durationMs: number, text = "Hi."): Take => ({
  id,
  assetId: `asset-${id}`,
  durationMs,
  words: [],
  textSnapshot: text,
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const line = (id: string, t: Take | null, text = "Hi."): ScriptLine => ({
  id,
  text,
  takes: t ? [t] : [],
  currentTakeId: t?.id ?? null
});

const input = (lines: ScriptLine[]): ScriptAssemblyInput => ({
  scriptId: "s1",
  cast: [],
  sections: [{ id: "sec", lines } satisfies ScriptSection]
});

const assembled = (lines: ScriptLine[]) => {
  const built = buildScriptTimeline(input(lines));
  return { tracks: built.tracks, clips: built.clips };
};

const startOf = (clips: { scriptLineId?: string; startMs: number }[], lineId: string) =>
  clips.find((c) => c.scriptLineId === lineId)?.startMs;

describe("reconcileScriptClips", () => {
  it("returns the same document when the script did not change", () => {
    const lines = [line("a", take("t1", 1000)), line("b", take("t2", 500))];
    const doc = assembled(lines);
    const result = reconcileScriptClips(doc, input(lines));
    expect(result.changed).toBe(false);
    expect(result.clips).toBe(doc.clips);
    expect(result.tracks).toBe(doc.tracks);
  });

  it("keeps a moved clip where it is when its line gets a new take", () => {
    const lines = [line("a", take("t1", 1000)), line("b", take("t2", 500))];
    const doc = assembled(lines);
    const moved = {
      ...doc,
      clips: doc.clips.map((c) =>
        c.scriptLineId === "b" ? { ...c, startMs: 5000 } : c
      )
    };
    const revoiced = [line("a", take("t3", 2500)), line("b", take("t2", 500))];
    const result = reconcileScriptClips(moved, input(revoiced));

    expect(result.changed).toBe(true);
    const a = result.clips.find((c) => c.scriptLineId === "a")!;
    expect(a.currentAssetId).toBe("asset-t3");
    expect(a.durationMs).toBe(2500);
    expect(a.startMs).toBe(0);
    expect(a.versions.map((v) => v.assetId)).toEqual(["asset-t3"]);
    // The later line does not ripple: its placement was the user's.
    expect(startOf(result.clips, "b")).toBe(5000);
  });

  it("relabels a clip on a text change without touching its timing", () => {
    const lines = [line("a", take("t1", 1000))];
    const doc = assembled(lines);
    const trimmed = {
      ...doc,
      clips: doc.clips.map((c) => ({ ...c, startMs: 300, inPointMs: 100 }))
    };
    const result = reconcileScriptClips(
      trimmed,
      input([line("a", take("t1", 1000), "Hello there.")])
    );
    const clip = result.clips[0];
    expect(clip.prompt).toBe("Hello there.");
    expect(clip.name).toBe("Hello there.");
    expect(clip.startMs).toBe(300);
    expect(clip.inPointMs).toBe(100);
    expect(clip.currentAssetId).toBe("asset-t1");
  });

  it("removes the clip of a deleted line and of a line without a take", () => {
    const lines = [
      line("a", take("t1", 1000)),
      line("b", take("t2", 500)),
      line("c", take("t3", 500))
    ];
    const doc = assembled(lines);
    const result = reconcileScriptClips(
      doc,
      input([line("a", take("t1", 1000)), line("c", null)])
    );
    expect(result.clips.map((c) => c.scriptLineId)).toEqual(["a"]);
  });

  it("places a new voiced line after the previous line's clip, past any overlap", () => {
    const lines = [line("a", take("t1", 1000)), line("c", take("t3", 500))];
    const doc = assembled(lines);
    // `c` sits right after `a` (1000ms); a new line `b` between them must not
    // land on top of it.
    const result = reconcileScriptClips(
      doc,
      input([
        { ...line("a", take("t1", 1000)), pauseAfterMs: 0 },
        line("b", take("t2", 400)),
        line("c", take("t3", 500))
      ])
    );
    const b = result.clips.find((c) => c.scriptLineId === "b")!;
    expect(b.trackId).toBe(doc.tracks[0].id);
    expect(b.startMs).toBe(1500);
    expect(startOf(result.clips, "c")).toBe(1000);
  });

  it("places a new line against the new length of a later line's retaken clip", () => {
    const lines = [line("a", take("t1", 1000)), line("c", take("t3", 500))];
    const doc = assembled(lines);
    // `c` gets a 2000ms take in the same pass, so it now ends at 3000ms.
    const result = reconcileScriptClips(
      doc,
      input([
        line("a", take("t1", 1000)),
        line("b", take("t2", 400)),
        line("c", take("t4", 2000))
      ])
    );
    const b = result.clips.find((c) => c.scriptLineId === "b")!;
    const c = result.clips.find((c) => c.scriptLineId === "c")!;
    expect(c.startMs).toBe(1000);
    expect(c.durationMs).toBe(2000);
    expect(b.startMs + b.durationMs <= c.startMs || b.startMs >= c.startMs + c.durationMs).toBe(true);
    expect(b.startMs).toBe(3000);
  });

  it("leaves reordered lines where their clips are", () => {
    const a = line("a", take("t1", 1000));
    const b = line("b", take("t2", 500));
    const doc = assembled([a, b]);
    const result = reconcileScriptClips(doc, input([b, a]));
    expect(result.changed).toBe(false);
  });

  it("adds a voiceover track to a sequence without one, and keeps foreign clips", () => {
    const video = makeTrack({ type: "video", name: "Video", index: 0 });
    const shot = makeClip({ trackId: video.id, startMs: 0, durationMs: 4000 });
    const result = reconcileScriptClips(
      { tracks: [video], clips: [shot] },
      input([line("a", take("t1", 1000))])
    );
    expect(result.tracks).toHaveLength(2);
    const voiceover = result.tracks[1];
    expect(voiceover).toMatchObject({ type: "audio", index: 1 });
    expect(result.clips[0]).toBe(shot);
    expect(result.clips[1]).toMatchObject({
      trackId: voiceover.id,
      scriptId: "s1",
      scriptLineId: "a",
      startMs: 0
    });
  });

  it("ignores clips that belong to another script", () => {
    const other = buildScriptTimeline({
      ...input([line("x", take("t9", 1000))]),
      scriptId: "s2"
    });
    const result = reconcileScriptClips(
      { tracks: other.tracks, clips: other.clips },
      input([])
    );
    expect(result.changed).toBe(false);
  });
});
