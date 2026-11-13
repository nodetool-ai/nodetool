import { describe, expect, it } from "vitest";
import { musicGenerationRequestSchema } from "@nodetool-ai/protocol";
import { MUSIC_TASKS } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { barStartFrame, frameToMs } from "../src/music/frames.js";
import {
  planMusicOperation,
  planToMusicRequest,
  type MusicPlanClip,
  type MusicPlanInput,
  type MusicPlanTrack
} from "../src/music/plan.js";
import type { MusicRole, TimelineTempo } from "../src/types.js";

const t120: TimelineTempo = { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } };
const BAR = 96000; // one 4/4 bar at 120 BPM
const bar = (n: number): number => barStartFrame(n, t120);

const track = (id: string, patch: Partial<MusicPlanTrack> = {}): MusicPlanTrack => ({ id, type: "audio", ...patch });
const clip = (id: string, trackId: string, startFrame: number, endFrame: number, patch: Partial<MusicPlanClip> = {}): MusicPlanClip => ({
  id,
  trackId,
  startMs: frameToMs(startFrame),
  durationMs: frameToMs(endFrame - startFrame),
  mediaType: "audio",
  currentAssetId: `asset-${id}`,
  status: "generated",
  ...patch
});

function input(patch: Partial<MusicPlanInput> & Pick<MusicPlanInput, "selection">): MusicPlanInput {
  return {
    tempo: t120,
    tracks: [track("bass", { musicRole: "bass" }), track("drums", { musicRole: "drums" })],
    clips: [],
    ...patch
  };
}
const select = (startFrame: number, endFrame: number, trackId = "bass") => ({ trackId, startFrame, endFrame });

describe("operation inference (GN-4)", () => {
  const drums = clip("d", "drums", bar(1), bar(9));
  const bassClip = clip("b", "bass", bar(1), bar(9));

  it("infers Regenerate for a range inside one clip", () => {
    const plan = planMusicOperation(input({ selection: select(bar(3), bar(5)), clips: [bassClip, drums] }));
    expect(plan.inferred).toBe("repaint");
    expect(plan.operation).toBe("repaint");
    expect(plan.valid).toEqual(["repaint"]);
    expect(plan.refusal).toBeUndefined();
    expect(plan.reason).toBe("The range lies inside one clip, so Regenerate replaces these bars.");
  });

  it("infers Add instrument for an empty range with audible audio elsewhere", () => {
    const plan = planMusicOperation(input({ selection: select(bar(1), bar(9)), clips: [drums] }));
    expect(plan.inferred).toBe("lego");
    expect(plan.valid).toEqual(["text2music", "lego"]);
    expect(plan.trackRole).toBe("bass");
    expect(plan.reason).toBe("The range is empty and other tracks play here, so Add instrument follows them.");
  });

  it("infers Generate for an empty range with nothing playing", () => {
    const plan = planMusicOperation(input({ selection: select(bar(1), bar(3)) }));
    expect(plan.inferred).toBe("text2music");
    expect(plan.valid).toEqual(["text2music"]);
    expect(plan.reason).toBe("The range is empty and no other track plays here, so Generate creates a clip.");
  });

  it("infers nothing for a partial overlap or a range over several clips", () => {
    const partial = planMusicOperation(input({ selection: select(bar(7), bar(11)), clips: [bassClip] }));
    expect(partial.inferred).toBeNull();
    expect(partial.operation).toBeNull();
    expect(partial.valid).toEqual([]);
    expect(partial.refusal).toBe("partial_overlap");
    expect(partial.reason).toContain("Select a range inside one clip or an empty range");
    const several = planMusicOperation(input({
      selection: select(bar(1), bar(9)),
      clips: [clip("b1", "bass", bar(1), bar(3)), clip("b2", "bass", bar(5), bar(7))]
    }));
    expect(several.inferred).toBeNull();
    expect(several.refusal).toBe("several_clips");
    expect(several.windowStartFrame).toBeUndefined();
  });

  it("follows the mixer for audibility: mute, clip mute and solo", () => {
    const sel = select(bar(1), bar(3));
    const muted = input({ selection: sel, clips: [drums], tracks: [track("bass", { musicRole: "bass" }), track("drums", { muted: true })] });
    expect(planMusicOperation(muted).inferred).toBe("text2music");
    expect(planMusicOperation(input({ selection: sel, clips: [{ ...drums, muted: true }] })).inferred).toBe("text2music");
    const soloElsewhere = input({
      selection: sel,
      clips: [drums],
      tracks: [track("bass", { musicRole: "bass" }), track("drums"), track("keys", { solo: true })]
    });
    expect(planMusicOperation(soloElsewhere).inferred).toBe("text2music");
    const soloDrums = input({ selection: sel, clips: [drums], tracks: [track("bass", { musicRole: "bass" }), track("drums", { solo: true })] });
    expect(planMusicOperation(soloDrums).inferred).toBe("lego");
    // A video clip on another track is not audio.
    expect(planMusicOperation(input({ selection: sel, clips: [{ ...drums, mediaType: "video" }] })).inferred).toBe("text2music");
  });

  it("hears only the clips the mixer plays: an asset in a playable status on a sound track", () => {
    const sel = select(bar(1), bar(3));
    const plays = (patch: Partial<MusicPlanClip>, tracks?: MusicPlanTrack[]) =>
      planMusicOperation(input({ selection: sel, clips: [{ ...drums, ...patch }], ...(tracks ? { tracks } : {}) }));
    for (const status of ["generated", "stale", "locked", "generating"] as const) {
      expect(plays({ status }).inferred, status).toBe("lego");
    }
    // A queued placeholder of another job, a failed or draft clip, and a clip with no asset are silent.
    for (const status of ["queued", "failed", "draft", "missing"] as const) {
      const plan = plays({ status });
      expect(plan.inferred, status).toBe("text2music");
      expect(plan.valid, status).toEqual(["text2music"]);
    }
    expect(plays({ status: undefined }).inferred).toBe("text2music");
    expect(plays({ currentAssetId: undefined }).inferred).toBe("text2music");
    const forced = planMusicOperation(input({ selection: sel, clips: [{ ...drums, status: "queued" }], operation: "lego" }));
    expect(forced.refusal).toBe("no_context");
    // A clip on a picture track is not mixed.
    const onVideo = [track("bass", { musicRole: "bass" }), track("drums", { type: "video" })];
    expect(plays({}, onVideo).inferred).toBe("text2music");
    const onMidi = [track("bass", { musicRole: "bass" }), track("drums", { type: "midi" })];
    expect(plays({}, onMidi).inferred).toBe("lego");
  });

  it("lets the person override with another valid operation", () => {
    const plan = planMusicOperation(input({ selection: select(bar(1), bar(9)), clips: [drums], operation: "text2music" }));
    expect(plan.inferred).toBe("lego");
    expect(plan.operation).toBe("text2music");
    expect(plan.refusal).toBeUndefined();
    expect(plan.reason).toBe("Generate is chosen in place of Add instrument.");
    expect(plan.segments).toEqual([{ startFrame: 0, endFrame: 8 * BAR }]);
    const occupied = planMusicOperation(input({ selection: select(bar(3), bar(5)), clips: [bassClip], operation: "text2music" }));
    expect(occupied.refusal).toBe("occupied");
    expect(occupied.reason).toBe("Generate needs an empty range. The range overlaps a clip on this track.");
  });
});

describe("Generate windows (GN-6)", () => {
  it("gives a 2-bar target at 120 BPM three segments per candidate", () => {
    const plan = planMusicOperation(input({ selection: select(bar(5), bar(7)) }));
    expect(plan.operation).toBe("text2music");
    expect(plan.windowStartFrame).toBe(bar(5));
    expect(plan.segments).toEqual([
      { startFrame: 0, endFrame: 2 * BAR },
      { startFrame: 2 * BAR, endFrame: 4 * BAR },
      { startFrame: 4 * BAR, endFrame: 6 * BAR }
    ]);
    // k * L plus one beat of room for the alignment shift.
    expect(plan.requestFrames).toBe(3 * 2 * BAR + 24000);
    expect(plan.beatPhaseFrames).toBe(0);
    const request = planToMusicRequest(plan, { candidates: 2 });
    // Each segment of each candidate becomes a take: six takes.
    expect(request.segments!.length * request.candidates).toBe(6);
  });

  it("uses one segment for a target of 10 seconds or more", () => {
    const plan = planMusicOperation(input({ selection: select(bar(5), bar(13)) }));
    expect(plan.segments).toEqual([{ startFrame: 0, endFrame: 8 * BAR }]);
    expect(plan.requestFrames).toBe(8 * BAR + 24000);
    // Exactly 10 seconds (5 bars at 120) still needs no second segment.
    expect(planMusicOperation(input({ selection: select(0, 480000) })).segments).toHaveLength(1);
    expect(planMusicOperation(input({ selection: select(0, 479999) })).segments).toHaveLength(2);
  });

  it("places the first beat of a free-placed target", () => {
    const plan = planMusicOperation(input({ selection: select(bar(2) + 1000, bar(4)) }));
    expect(plan.beatPhaseFrames).toBe(24000 - 1000);
    const sixEight = planMusicOperation(input({
      tempo: { ...t120, timeSignature: { beatsPerBar: 6, beatUnit: 8 } },
      selection: select(5000, 5000 + 144000)
    }));
    expect(sixEight.beatPhaseFrames).toBe(12000 - 5000);
    expect(sixEight.requestFrames).toBe(4 * 144000 + 12000);
  });

  it("refuses a request over 600 seconds", () => {
    const plan = planMusicOperation(input({ selection: select(0, 600 * 48000) }));
    expect(plan.refusal).toBe("window_too_long");
    expect(plan.reason).toBe("Generate needs a window of at most 600 seconds. Select a shorter range.");
    expect(plan.valid).toEqual([]);
  });
});

describe("Regenerate and Add instrument windows (GN-5)", () => {
  it("reaches back two bars over the clip and grows to 10 seconds in whole bars", () => {
    const plan = planMusicOperation(input({ selection: select(bar(3), bar(5)), clips: [clip("b", "bass", bar(1), bar(9))] }));
    // Bars 1 to 5 are 8 s; one more bar makes 10 s.
    expect(plan.windowStartFrame).toBe(bar(1));
    expect(plan.requestFrames).toBe(5 * BAR);
    expect(plan.region).toEqual({ startFrame: 2 * BAR, endFrame: 4 * BAR });
    expect(plan.clipId).toBe("b");
    expect(plan.splice).toEqual({ parentAssetId: "asset-b", startFrame: 2 * BAR, endFrame: 4 * BAR });
  });

  it("stops the pre-roll where the context has no audio", () => {
    const clips = [clip("b", "bass", bar(4), bar(20))];
    const plan = planMusicOperation(input({ selection: select(bar(6), bar(8)), clips }));
    expect(plan.windowStartFrame).toBe(bar(4));
    const none = planMusicOperation(input({ selection: select(bar(4), bar(6)), clips }));
    expect(none.windowStartFrame).toBe(bar(4));
    // A muted clip on the target track is not context.
    const mutedBefore = [clip("m", "bass", bar(1), bar(4), { muted: true }), ...clips];
    expect(planMusicOperation(input({ selection: select(bar(5), bar(7)), clips: mutedBefore })).windowStartFrame).toBe(bar(4));
  });

  it("starts the window on the bar line before a free-placed target and ends on the one after", () => {
    const clips = [clip("b", "bass", 0, bar(30))];
    const plan = planMusicOperation(input({ selection: select(bar(10) + 500, bar(16) - 700), clips }));
    expect(plan.windowStartFrame).toBe(bar(8));
    expect(plan.requestFrames).toBe(bar(16) - bar(8));
    expect(plan.region).toEqual({ startFrame: 2 * BAR + 500, endFrame: 8 * BAR - 700 });
  });

  it("puts the splice at the in-point plus the distance from the clip start", () => {
    const clips = [clip("b", "bass", bar(3), bar(11), { inPointMs: 1500 })];
    const plan = planMusicOperation(input({ selection: select(bar(5), bar(6)), clips }));
    expect(plan.splice).toEqual({ parentAssetId: "asset-b", startFrame: 72000 + 2 * BAR, endFrame: 72000 + 3 * BAR });
  });

  it("uses the other audible tracks as the context of Add instrument", () => {
    const clips = [clip("d", "drums", bar(1), bar(9))];
    const plan = planMusicOperation(input({ selection: select(bar(4), bar(6)), clips }));
    expect(plan.operation).toBe("lego");
    expect(plan.windowStartFrame).toBe(bar(2));
    expect(plan.region).toEqual({ startFrame: 2 * BAR, endFrame: 4 * BAR });
    expect(plan.requestFrames).toBe(5 * BAR);
    expect(plan.splice).toBeUndefined();
  });

  it("refuses Regenerate on a clip with a speed or a time remap", () => {
    const sel = select(bar(3), bar(5));
    const fast = planMusicOperation(input({ selection: sel, clips: [clip("b", "bass", 0, bar(9), { speedMultiplier: 1.5 })] }));
    expect(fast.inferred).toBe("repaint");
    expect(fast.refusal).toBe("speed");
    expect(fast.reason).toBe("Regenerate cannot replace bars in a clip that plays at a speed other than 1.");
    expect(fast.valid).toEqual([]);
    const baked = planMusicOperation(input({ selection: sel, clips: [clip("b", "bass", 0, bar(9), { speedMultiplier: 1.5, speedBaked: true })] }));
    expect(baked.refusal).toBeUndefined();
    const remapped = planMusicOperation(input({
      selection: sel,
      clips: [clip("b", "bass", 0, bar(9), { timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 1, sourceMs: 9000 }] } })]
    }));
    expect(remapped.refusal).toBe("time_remap");
    expect(remapped.reason).toBe("Regenerate cannot replace bars in a clip with a time remap.");
    const silent = planMusicOperation(input({ selection: sel, clips: [clip("b", "bass", 0, bar(9), { currentAssetId: undefined })] }));
    expect(silent.refusal).toBe("no_asset");
  });

  it("refuses a window over 600 seconds", () => {
    const long = 700 * 48000;
    const plan = planMusicOperation(input({ selection: select(0, long), clips: [clip("b", "bass", 0, long)] }));
    expect(plan.refusal).toBe("window_too_long");
    expect(plan.reason).toBe("Regenerate needs a window of at most 600 seconds. Select a shorter range.");
  });

  it("refuses Add instrument without a role or without audible context", () => {
    const clips = [clip("d", "drums", bar(1), bar(9))];
    const noRole = planMusicOperation(input({ selection: select(bar(1), bar(3)), clips, tracks: [track("bass"), track("drums")] }));
    expect(noRole.inferred).toBe("lego");
    expect(noRole.refusal).toBe("missing_role");
    expect(noRole.reason).toBe("Add instrument needs a role on the target track.");
    expect(noRole.valid).toEqual(["text2music"]);
    const alone = planMusicOperation(input({ selection: select(bar(1), bar(3)), operation: "lego" }));
    expect(alone.refusal).toBe("no_context");
    expect(alone.reason).toBe("Add instrument needs audible audio on another track in the range.");
  });
});

describe("plan refusals before inference", () => {
  it("refuses a bad selection, a missing track, a non-audio track and a music-incompatible tempo", () => {
    expect(planMusicOperation(input({ selection: select(10, 10) })).refusal).toBe("invalid_selection");
    expect(planMusicOperation(input({ selection: select(-1, 10) })).refusal).toBe("invalid_selection");
    expect(planMusicOperation(input({ selection: select(0.5, 10) })).refusal).toBe("invalid_selection");
    expect(planMusicOperation(input({ selection: select(0, 10, "gone") })).refusal).toBe("no_track");
    const video = planMusicOperation(input({ selection: select(0, 10, "v"), tracks: [{ id: "v", type: "video" }] }));
    expect(video.refusal).toBe("not_audio_track");
    const fractional = planMusicOperation(input({ selection: select(0, BAR), tempo: { ...t120, bpm: 87.5 } }));
    expect(fractional.inferred).toBe("text2music");
    expect(fractional.valid).toEqual([]);
    expect(fractional.refusal).toBe("tempo");
    expect(fractional.reason).toBe("A music project needs a whole-number tempo from 30 to 300 BPM.");
  });
});

describe("planToMusicRequest", () => {
  it("maps a plan one to one onto the request schema", () => {
    const regen = planMusicOperation(input({
      tempo: { ...t120, key: { tonic: "F#", mode: "minor" } },
      selection: select(bar(3), bar(5)),
      clips: [clip("b", "bass", bar(1), bar(9))]
    }));
    expect(planToMusicRequest(regen, { candidates: 2, seed: 7, contextAssetId: "ctx" })).toEqual({
      task: "repaint",
      bpm: 120,
      key: { tonic: "F#", mode: "minor" },
      beats_per_bar: 4,
      beat_unit: 4,
      candidates: 2,
      seed: 7,
      request_frames: 5 * BAR,
      window_start_frame: 0,
      context_asset_id: "ctx",
      region: { start_frame: 2 * BAR, end_frame: 4 * BAR },
      splice: { parent_asset_id: "asset-b", start_frame: 2 * BAR, end_frame: 4 * BAR }
    });
    expect(() => planToMusicRequest(regen, { candidates: 2 })).toThrow("Regenerate needs the context bounce's asset id.");
    const refused = planMusicOperation(input({ selection: select(10, 10) }));
    expect(() => planToMusicRequest(refused, { candidates: 2 })).toThrow("A refused plan has no request");
  });

  it("builds a request that passes the schema for every plan of 400 seeded cases", () => {
    let seed = 20261112;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const roles: (MusicRole | undefined)[] = ["bass", "drums", "synth", undefined];
    const signatures = [[2, 4], [3, 4], [4, 4], [6, 8]] as const;
    const built = new Set<string>();
    for (let n = 0; n < 400; n += 1) {
      const [beatsPerBar, beatUnit] = pick(signatures);
      const tempo: TimelineTempo = {
        bpm: 30 + Math.floor(random() * 271),
        offsetMs: pick([0, 0, 125, 1000]),
        timeSignature: { beatsPerBar, beatUnit },
        ...(random() < 0.5 ? { key: { tonic: "A", mode: "minor" } as const } : {})
      };
      const b = (k: number) => barStartFrame(k, tempo);
      const tracks = ["t0", "t1", "t2"].map((id) => track(id, { musicRole: pick(roles), muted: random() < 0.15, solo: random() < 0.1 }));
      const clips: MusicPlanClip[] = [];
      for (const t of tracks) {
        for (let c = 0; c < 2; c += 1) {
          if (random() < 0.5) continue;
          const start = b(1 + Math.floor(random() * 12));
          clips.push(clip(`${t.id}-${c}`, t.id, start, start + b(2 + Math.floor(random() * 10)) - b(1), {
            inPointMs: pick([0, 0, 500]),
            muted: random() < 0.1
          }));
        }
      }
      const startBar = 1 + Math.floor(random() * 12);
      const plan = planMusicOperation({
        tempo,
        tracks,
        clips,
        selection: { trackId: "t0", startFrame: b(startBar), endFrame: b(startBar + 1 + Math.floor(random() * 6)) },
        ...(random() < 0.3 ? { operation: pick(MUSIC_TASKS) } : {})
      });
      if (plan.refusal) continue;
      const request = planToMusicRequest(plan, { candidates: 1 + Math.floor(random() * 4), contextAssetId: "ctx" });
      const parsed = musicGenerationRequestSchema.safeParse(request);
      expect(parsed.success, parsed.success ? "" : `${JSON.stringify(request)}: ${parsed.error.message}`).toBe(true);
      built.add(request.task);
    }
    expect([...built].sort()).toEqual(["lego", "repaint", "text2music"]);
  });
});
