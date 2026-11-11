/**
 * The boundary between the native editor and everything that reads its
 * documents. `param-curves.json` is the file `tst_keyframes` compares the native
 * edits against, so a change to what native writes fails there, and a change to
 * what the schema keeps fails here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { compileClipAnimations, type TimelineClip } from "@nodetool-ai/timeline";

import { collectStrippedPaths, validateTimelineSequence } from "../src/timeline-debug/index.js";

const fixture = () =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../../native/timeline/src/edit/keyframes/fixtures/param-curves.json",
          import.meta.url
        )
      ),
      "utf8"
    )
  ) as { clips: Record<string, unknown>[] } & Record<string, unknown>;

const meta = { fps: 30, width: 640, height: 360 };

describe("a document the native editor saved", () => {
  it("keeps paramCurves through the schema, with nothing stripped", () => {
    const raw = fixture();
    const parsed = timelineDocument.parse(raw);
    expect((parsed.clips[0] as TimelineClip).paramCurves).toEqual(raw.clips[0].paramCurves);
    const stripped = new Set<string>();
    collectStrippedPaths(raw.clips, parsed.clips, "clips", stripped);
    expect([...stripped]).toEqual([]);
    expect(JSON.parse(JSON.stringify(parsed.clips[0])).paramCurves).toHaveLength(6);
  });

  it("validates", () => {
    const report = validateTimelineSequence(fixture() as never, meta);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("keeps a name no reader knows, and that name affects nothing else", () => {
    const raw = fixture();
    const animation = {
      id: "m",
      role: "emphasis",
      preset: "custom",
      durationMs: 2000,
      delayMs: 0,
      enabled: true,
      params: { keyframed: true },
      custom: { curves: [{ property: "offsetX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 10 }] }] }
    };
    const future = { property: "future:thing", keyframes: [{ t: 0, value: 1 }] };
    raw.clips[0] = {
      ...raw.clips[0],
      animations: [animation],
      paramCurves: [...(raw.clips[0].paramCurves as unknown[]), future]
    };
    const parsed = timelineDocument.parse(raw);
    const clip = parsed.clips[0] as TimelineClip;
    expect(clip.paramCurves?.at(-1)).toEqual(future);
    const report = validateTimelineSequence(raw as never, meta);
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((issue) => /animation|curve/i.test(issue.message))).toEqual([]);
    // The keyframe animation still compiles. A name inside it would stop that.
    const compiled = compileClipAnimations(clip.animations, clip.durationMs, { width: 640, height: 360 });
    expect(compiled).toHaveLength(1);
    expect(compiled[0].curves.map((c) => c.property)).toEqual(["offsetX"]);
  });

  it("keeps the stash of every switchable group", () => {
    const raw = fixture();
    const stored = {
      motion: { curves: [{ property: "depthPx", keyframes: [{ t: 0, value: 1 }] }] },
      opacity: { opacity: 0.5, curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }] }] },
      volume: { volumeDb: -6, curves: [{ property: "volumeDb", keyframes: [{ t: 0, value: -3 }] }] }
    };
    raw.clips[0] = { ...raw.clips[0], bypassedFixedEffects: stored };
    const parsed = timelineDocument.parse(raw);
    expect((parsed.clips[0] as TimelineClip).bypassedFixedEffects).toEqual(stored);
    expect(validateTimelineSequence(raw as never, meta).errors).toEqual([]);
  });
});
