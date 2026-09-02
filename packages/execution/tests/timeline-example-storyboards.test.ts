/**
 * The shipped example storyboards, assembled into cuts and run through the
 * whole validator — the regression that keeps a new code from warning about
 * documents NodeTool itself produces.
 *
 * Every code T30 added is a heuristic over authored motion, and a heuristic
 * that fires on the product's own examples is not a check, it is noise on
 * first launch. The boards are read from disk rather than reconstructed here,
 * so a board edited later is covered without touching this file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Shot } from "@nodetool-ai/protocol";
import { buildStoryboardTimeline } from "@nodetool-ai/timeline";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

const STORYBOARD_DIR = fileURLToPath(
  new URL(
    "../../base-nodes/nodetool/examples/storyboards/",
    import.meta.url
  )
);

interface StoryboardBundle {
  name: string;
  document: { screenplay: { id: string; shots: Shot[] } };
}

const bundles = readdirSync(STORYBOARD_DIR)
  .filter((file) => file.endsWith(".storyboard.json"))
  .map((file) => ({
    file,
    bundle: JSON.parse(
      readFileSync(`${STORYBOARD_DIR}${file}`, "utf8")
    ) as StoryboardBundle
  }));

describe("validateTimelineSequence — shipped example storyboards", () => {
  it("finds boards to assemble", () => {
    // A glob that matched nothing would pass every assertion below.
    expect(bundles.length).toBeGreaterThan(0);
  });

  it.each(bundles)("$file assembles into a clean timeline", ({ bundle }) => {
    const screenplay = bundle.document.screenplay;
    // A shipped board references its media as `package://` assets with no row
    // id, and `isAssemblableShot` wants one — an installed board has them. The
    // substitution is what an install does; everything else about the assembly
    // is the shipped board's own.
    const shots = screenplay.shots.map((shot) => ({
      ...shot,
      clip: shot.clip ? { ...shot.clip, asset_id: `asset-${shot.id}` } : shot.clip
    }));
    const assembled = buildStoryboardTimeline({
      boardId: screenplay.id,
      shots
    });
    expect(assembled.clips.length).toBeGreaterThan(0);

    const result = validateTimelineSequence({
      tracks: assembled.tracks,
      clips: assembled.clips,
      markers: []
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
