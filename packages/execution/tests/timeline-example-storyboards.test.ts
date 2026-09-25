/**
 * Shipped storyboard examples contain stills and can be opened without
 * creating video clips in a timeline.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Shot } from "@nodetool-ai/protocol";
import { buildStoryboardTimeline } from "@nodetool-ai/timeline";

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

describe("shipped example storyboards", () => {
  it("finds boards to inspect", () => {
    // A glob that matched nothing would pass every assertion below.
    expect(bundles.length).toBeGreaterThan(0);
  });

  it.each(bundles)("$file has stills without video clips", ({ bundle }) => {
    const screenplay = bundle.document.screenplay;
    expect(screenplay.shots.length).toBeGreaterThan(0);
    expect(screenplay.shots.every((shot) => shot.keyframe?.uri && !shot.clip)).toBe(true);
    const assembled = buildStoryboardTimeline({
      boardId: screenplay.id,
      shots: screenplay.shots
    });
    expect(assembled.clips).toEqual([]);
  });
});
