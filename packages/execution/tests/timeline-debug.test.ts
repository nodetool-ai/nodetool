import { describe, expect, it } from "vitest";

import {
  buildTimelineDebugReport,
  renderTimelineReportMarkdown,
  validateTimelineSequence,
  type TimelineDebugIssue,
  type TimelineInteractionRecord
} from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const track = (overrides: Json = {}): Json => ({
  id: "track-1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false,
  ...overrides
});

const clip = (overrides: Json = {}): Json => ({
  id: "clip-1",
  trackId: "track-1",
  name: "Shot 1",
  startMs: 0,
  durationMs: 2000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...overrides
});

const doc = (overrides: Json = {}): Json => ({
  tracks: [track()],
  clips: [clip()],
  markers: [],
  ...overrides
});

const codes = (issues: ReadonlyArray<TimelineDebugIssue>): string[] =>
  issues.map((issue) => issue.code);

describe("validateTimelineSequence — schema", () => {
  it("accepts a minimal sound document", () => {
    const result = validateTimelineSequence(doc());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports schema_invalid with the offending path and skips structural checks", () => {
    const result = validateTimelineSequence({
      tracks: [track()],
      clips: [clip({ durationMs: "long" })],
      markers: []
    });
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toEqual(["schema_invalid"]);
    expect(result.errors[0]?.path).toBe("clips.0.durationMs");
    expect(result.warnings).toEqual([]);
  });

  it("reports schema_invalid for a non-object document", () => {
    const result = validateTimelineSequence("not a timeline");
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("schema_invalid");
  });
});

describe("validateTimelineSequence — field_stripped", () => {
  it("flags an unknown top-level key", () => {
    const result = validateTimelineSequence(doc({ notes: "keep me" }));
    const stripped = result.warnings.filter((w) => w.code === "field_stripped");
    expect(stripped.map((w) => w.path)).toEqual(["notes"]);
    expect(result.ok).toBe(true);
  });

  it("collapses array indices into a single path", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({ id: "clip-1", customField: 1 }),
          clip({ id: "clip-2", startMs: 3000, customField: 2 })
        ]
      })
    );
    const stripped = result.warnings.filter((w) => w.code === "field_stripped");
    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.path).toBe("clips[*].customField");
  });

  it("finds a stripped field nested inside an array of objects", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              {
                id: "anim-1",
                role: "in",
                preset: "fade",
                durationMs: 400,
                unknownKnob: true
              }
            ]
          })
        ]
      })
    );
    const paths = result.warnings
      .filter((w) => w.code === "field_stripped")
      .map((w) => w.path);
    expect(paths).toEqual(["clips[*].animations[*].unknownKnob"]);
  });

  it("finds a stripped field nested inside an object", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            textStyle: {
              text: "Hello",
              fontSizePx: 48,
              color: "#fff",
              notATextStyleField: 2
            },
            mediaType: "text"
          })
        ]
      })
    );
    const paths = result.warnings
      .filter((w) => w.code === "field_stripped")
      .map((w) => w.path);
    expect(paths).toEqual(["clips[*].textStyle.notATextStyleField"]);
  });

  it("ignores undefined values in the input", () => {
    const result = validateTimelineSequence(doc({ notes: undefined }));
    expect(codes(result.warnings)).not.toContain("field_stripped");
  });

  it("does not flag fields the schema keeps", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            linkId: "link-1",
            speaker: "Ada",
            paragraphId: "p-1",
            storyboardShotId: "shot-1",
            scriptLineId: "line-1",
            caption: { words: [{ word: "hi", startMs: 0, endMs: 500 }] }
          }),
          clip({ id: "clip-2", startMs: 5000, linkId: "link-1" })
        ]
      })
    );
    expect(codes(result.warnings)).not.toContain("field_stripped");
  });
});

describe("validateTimelineSequence — structural checks", () => {
  it("flags a clip on a track the document does not declare", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ trackId: "ghost" })] })
    );
    expect(codes(result.errors)).toContain("clip_track_missing");
    expect(result.ok).toBe(false);
  });

  it("flags overlapping clips on one track and names both", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({ id: "a", name: "A", startMs: 0, durationMs: 2000 }),
          clip({ id: "b", name: "B", startMs: 1500, durationMs: 1000 })
        ]
      })
    );
    const overlap = result.warnings.find((w) => w.code === "clips_overlap");
    expect(overlap?.message).toContain("\"A\"");
    expect(overlap?.message).toContain("\"B\"");
    expect(result.ok).toBe(true);
  });

  it("does not flag clips that merely touch", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({ id: "a", startMs: 0, durationMs: 1000 }),
          clip({ id: "b", startMs: 1000, durationMs: 1000 })
        ]
      })
    );
    expect(codes(result.warnings)).not.toContain("clips_overlap");
  });

  it("does not flag overlap across different tracks", () => {
    const result = validateTimelineSequence(
      doc({
        tracks: [track(), track({ id: "track-2", index: 1 })],
        clips: [
          clip({ id: "a" }),
          clip({ id: "b", trackId: "track-2" })
        ]
      })
    );
    expect(codes(result.warnings)).not.toContain("clips_overlap");
  });

  it("flags negative start and non-positive duration", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ startMs: -10, durationMs: 0 })] })
    );
    expect(codes(result.errors).filter((c) => c === "negative_timing")).toHaveLength(2);
  });

  it("flags a negative marker time", () => {
    const result = validateTimelineSequence(
      doc({ markers: [{ id: "m1", timeMs: -5, label: "Intro" }] })
    );
    expect(codes(result.errors)).toContain("negative_timing");
  });

  it("flags fades that exceed the clip duration", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ durationMs: 1000, fadeInMs: 600, fadeOutMs: 600 })] })
    );
    expect(codes(result.errors)).toContain("fade_exceeds_duration");
  });

  it("accepts fades that exactly fill the clip", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ durationMs: 1000, fadeInMs: 500, fadeOutMs: 500 })] })
    );
    expect(result.ok).toBe(true);
  });

  it("flags an empty or negative source span", () => {
    const inverted = validateTimelineSequence(
      doc({ clips: [clip({ inPointMs: 2000, outPointMs: 1000 })] })
    );
    expect(codes(inverted.errors)).toContain("in_out_points_invalid");

    const negative = validateTimelineSequence(
      doc({ clips: [clip({ inPointMs: -100, outPointMs: 500 })] })
    );
    expect(codes(negative.errors)).toContain("in_out_points_invalid");
  });

  it("compares the source span rate-aware", () => {
    const baked = validateTimelineSequence(
      doc({
        clips: [
          clip({
            durationMs: 2000,
            inPointMs: 0,
            outPointMs: 4000,
            speedMultiplier: 2
          })
        ]
      })
    );
    expect(codes(baked.warnings)).not.toContain("in_out_duration_mismatch");

    const mismatched = validateTimelineSequence(
      doc({ clips: [clip({ durationMs: 2000, inPointMs: 0, outPointMs: 4000 })] })
    );
    expect(codes(mismatched.warnings)).toContain("in_out_duration_mismatch");
  });

  it("flags a non-positive speed multiplier", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ speedMultiplier: 0 })] })
    );
    expect(codes(result.errors)).toContain("speed_multiplier_invalid");
  });

  it("flags a transition longer than the clip", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({ durationMs: 500, transitionIn: { type: "crossfade", durationMs: 900 } })
        ]
      })
    );
    expect(codes(result.warnings)).toContain("transition_exceeds_duration");
  });

  it("flags an animation preset this build does not ship", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              { id: "anim-1", role: "in", preset: "warp-drive", durationMs: 300 }
            ]
          })
        ]
      })
    );
    expect(codes(result.errors)).toContain("unknown_animation_preset");
  });

  it("flags a custom animation whose baked curves are unusable", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              {
                id: "anim-1",
                role: "in",
                preset: "custom",
                durationMs: 300,
                custom: {
                  code: "return {samples: []};",
                  curves: [
                    { property: "skewX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
                  ]
                }
              }
            ]
          })
        ]
      })
    );
    expect(codes(result.errors)).toContain("custom_animation_invalid");
  });

  it("flags a custom animation with no payload at all", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              { id: "anim-1", role: "in", preset: "custom", durationMs: 300 }
            ]
          })
        ]
      })
    );
    expect(codes(result.errors)).toContain("custom_animation_invalid");
  });

  it("flags a wipeProgress curve with no mask behind it", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              {
                id: "anim-1",
                role: "in",
                preset: "custom",
                durationMs: 300,
                custom: {
                  code: "return {samples: []};",
                  curves: [
                    {
                      property: "wipeProgress",
                      keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }]
                    }
                  ]
                }
              }
            ]
          })
        ]
      })
    );
    expect(codes(result.errors)).toContain("custom_animation_invalid");
  });

  it("warns when baked curves name nothing that could re-bake them", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              {
                id: "anim-1",
                role: "in",
                preset: "custom",
                durationMs: 300,
                custom: {
                  curves: [
                    { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
                  ]
                }
              }
            ]
          })
        ]
      })
    );
    expect(codes(result.warnings)).toContain("custom_animation_unsourced");
    expect(result.ok).toBe(true);
  });

  it("accepts a well-formed custom animation", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [
              {
                id: "anim-1",
                role: "in",
                preset: "custom",
                durationMs: 300,
                custom: {
                  scriptId: "script-1",
                  curves: [
                    { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
                  ]
                }
              }
            ]
          })
        ]
      })
    );
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).not.toContain("custom_animation_unsourced");
  });

  it("accepts a shipped animation preset", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            animations: [{ id: "anim-1", role: "in", preset: "fade", durationMs: 300 }]
          })
        ]
      })
    );
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).not.toContain("field_stripped");
  });

  it("flags a generated clip bound to neither a workflow nor a prompt", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ sourceType: "generated" })] })
    );
    expect(codes(result.warnings)).toContain("binding_incomplete");

    const bound = validateTimelineSequence(
      doc({ clips: [clip({ sourceType: "generated", prompt: "a fox" })] })
    );
    expect(codes(bound.warnings)).not.toContain("binding_incomplete");
  });

  it("flags duplicate track, clip, and marker ids", () => {
    const result = validateTimelineSequence({
      tracks: [track(), track()],
      clips: [clip(), clip({ startMs: 9000 })],
      markers: [
        { id: "m", timeMs: 0, label: "a" },
        { id: "m", timeMs: 1, label: "b" }
      ]
    });
    expect(codes(result.errors).filter((c) => c === "duplicate_id")).toHaveLength(3);
  });

  it("flags duplicate indexes on visual tracks", () => {
    const result = validateTimelineSequence(
      doc({ tracks: [track(), track({ id: "track-2" })] })
    );
    expect(codes(result.warnings)).toContain("duplicate_track_index");
  });

  it("ignores an audio track sharing an index with a video track", () => {
    const result = validateTimelineSequence(
      doc({ tracks: [track(), track({ id: "track-2", type: "audio" })] })
    );
    expect(codes(result.warnings)).not.toContain("duplicate_track_index");
  });

  it("flags caption words outside the clip window", () => {
    const result = validateTimelineSequence(
      doc({
        clips: [
          clip({
            durationMs: 1000,
            caption: { words: [{ word: "late", startMs: 900, endMs: 4000 }] }
          })
        ]
      })
    );
    expect(codes(result.warnings)).toContain("caption_out_of_range");
  });

  it("flags a transcript line owning a clip that is gone", () => {
    const result = validateTimelineSequence(
      doc({
        transcript: [
          { id: "line-1", text: "hi", beatStartMs: 0, clipIds: ["clip-1", "ghost"] }
        ]
      })
    );
    expect(codes(result.warnings)).toContain("transcript_clip_missing");
  });

  it("flags a lone linkId", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ linkId: "link-1" })] })
    );
    expect(codes(result.warnings)).toContain("link_partner_missing");
  });

  it("flags a clip shorter than one frame at the given fps", () => {
    const result = validateTimelineSequence(
      doc({ clips: [clip({ durationMs: 10 })] }),
      { fps: 30 }
    );
    expect(codes(result.warnings)).toContain("clip_shorter_than_frame");

    const highFps = validateTimelineSequence(
      doc({ clips: [clip({ durationMs: 10 })] }),
      { fps: 120 }
    );
    expect(codes(highFps.warnings)).not.toContain("clip_shorter_than_frame");
  });
});

const target = { kind: "file" as const, ref: "seq.json", name: "My Sequence" };

describe("buildTimelineDebugReport", () => {
  it("derives meta from the document with defaults", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc({
        tracks: [track(), track({ id: "track-2", index: 1 })],
        clips: [clip({ startMs: 1000, durationMs: 2500 })]
      })
    });
    expect(report.meta).toEqual({
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 3500,
      trackCount: 2,
      clipCount: 1
    });
    expect(report.verdict.ok).toBe(true);
    expect(report.notSimulated.length).toBeGreaterThan(0);
    expect(report.interactions).toEqual([]);
    expect(report.finalValidation).toBeUndefined();
  });

  it("honors supplied meta", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc(),
      meta: { fps: 24, width: 1080, height: 1920 }
    });
    expect(report.meta.fps).toBe(24);
    expect(report.meta.width).toBe(1080);
    expect(report.meta.height).toBe(1920);
  });

  it("fails the verdict on a validation error and lists it", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc({ clips: [clip({ trackId: "ghost" })] })
    });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues[0]).toContain("clip_track_missing");
    expect(report.verdict.headline).toContain("problem");
  });

  it("keeps the verdict ok when only warnings are present", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc({ notes: "stripped" })
    });
    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.warnings?.[0]).toContain("field_stripped");
    expect(report.verdict.headline).toContain("warning");
  });

  it("fails the verdict on a failed interaction", () => {
    const interactions: TimelineInteractionRecord[] = [
      { tool: "ui_timeline_add_clip", input: { trackId: "track-1" }, ok: true },
      {
        tool: "ui_timeline_move_clip",
        input: { clipId: "ghost" },
        ok: false,
        error: "no such clip"
      }
    ];
    const report = buildTimelineDebugReport({ target, document: doc(), interactions });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.some((i) => i.includes("no such clip"))).toBe(true);
    expect(report.interactions).toHaveLength(2);
  });

  it("validates the final document separately and counts it in meta", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc(),
      finalState: { clipCount: 2 },
      finalDocument: doc({
        clips: [clip(), clip({ id: "clip-2", startMs: 4000, durationMs: -1 })]
      })
    });
    expect(report.validation.ok).toBe(true);
    expect(report.finalValidation?.ok).toBe(false);
    expect(report.meta.clipCount).toBe(2);
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.some((i) => i.startsWith("After edits"))).toBe(true);
    expect(report.finalState).toEqual({ clipCount: 2 });
  });
});

describe("renderTimelineReportMarkdown", () => {
  it("renders target, meta, issues, interactions, and not-simulated", () => {
    const report = buildTimelineDebugReport({
      target,
      document: doc({ notes: "x", clips: [clip({ trackId: "ghost" })] }),
      interactions: [
        { tool: "ui_timeline_split_clip", input: { clipId: "clip-1" }, ok: false, error: "boom" }
      ],
      finalState: { tracks: 1 },
      finalDocument: doc({ markers: [{ id: "m", timeMs: -1, label: "bad" }] })
    });
    const md = renderTimelineReportMarkdown(report);
    expect(md).toContain("# Timeline debug: My Sequence");
    expect(md).toContain("❌");
    expect(md).toContain("Target: `seq.json` (file)");
    expect(md).toContain("1920×1080 @ 30fps");
    expect(md).toContain("## Validation");
    expect(md).toContain("clip_track_missing");
    expect(md).toContain("field_stripped");
    expect(md).toContain("## Interactions");
    expect(md).toContain("ui_timeline_split_clip");
    expect(md).toContain("boom");
    expect(md).toContain("## Validation after edits");
    expect(md).toContain("## Final state");
    expect(md).toContain("## Not simulated");
  });

  it("renders a clean report without issue sections", () => {
    const md = renderTimelineReportMarkdown(
      buildTimelineDebugReport({ target, document: doc() })
    );
    expect(md).toContain("✅");
    expect(md).not.toContain("## Issues");
    expect(md).not.toContain("## Interactions");
  });
});
