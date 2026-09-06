/**
 * Platform-tag regression tests for the video-nodes registration arrays.
 *
 * Most of TIMELINE_NODES, and all of VIDEO_NODES, shell out to ffmpeg/ffprobe
 * and write os.tmpdir() temp files, so they can only run on the full Node tier
 * — never on the V8-isolate (workers/edge) or browser runtimes, which have no
 * subprocess and no filesystem. These tests lock that in: a future accidental
 * tagAsServer / tagAsUniversal on either group would fail here loudly.
 *
 * The exception is named, not blanket. The document derivations
 * (`FillTimelineText`, `RetargetTimeline`) read and write a persisted sequence
 * through the model interfaces and touch neither a subprocess nor the disk, so
 * they are tagged server. Any *other* node that turns up server-tagged in
 * TIMELINE_NODES fails here.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePlatforms,
  supportsPlatform,
  type Platform
} from "@nodetool-ai/protocol";
import { TIMELINE_NODES, VIDEO_NODES } from "@nodetool-ai/video-nodes";

type WithPlatforms = { nodeType?: string; platforms?: readonly Platform[] };

/** The effective platform set, applying the registry's unset → ["node"] rule. */
function effectivePlatforms(cls: WithPlatforms): readonly Platform[] {
  return normalizePlatforms(cls.platforms);
}

/** The only timeline nodes allowed off the node-only tier, by node type. */
const SERVER_TIMELINE_NODES = new Set([
  "nodetool.timeline.FillTimelineText",
  "nodetool.timeline.RetargetTimeline"
]);

const ffmpegTimelineNodes = () =>
  (TIMELINE_NODES as unknown as WithPlatforms[]).filter(
    (cls) => !SERVER_TIMELINE_NODES.has(cls.nodeType ?? "")
  );

describe("TIMELINE_NODES platform tags", () => {
  it("covers both groups, so neither filter can pass by matching nothing", () => {
    const all = TIMELINE_NODES as unknown as WithPlatforms[];
    expect(ffmpegTimelineNodes().length).toBeGreaterThan(0);
    expect(all.length - ffmpegTimelineNodes().length).toBe(
      SERVER_TIMELINE_NODES.size
    );
  });

  it("tags every ffmpeg-backed timeline node as ['node'] only", () => {
    for (const cls of ffmpegTimelineNodes()) {
      // tagAsNode stamps platforms explicitly, so the raw value is ['node'].
      expect(cls.platforms).toEqual(["node"]);
      expect(effectivePlatforms(cls)).toEqual(["node"]);
    }
  });

  it("never offers an ffmpeg-backed timeline node to workers / edge / browser", () => {
    for (const cls of ffmpegTimelineNodes()) {
      expect(supportsPlatform(cls.platforms, "node")).toBe(true);
      expect(supportsPlatform(cls.platforms, "workers")).toBe(false);
      expect(supportsPlatform(cls.platforms, "edge")).toBe(false);
      expect(supportsPlatform(cls.platforms, "browser")).toBe(false);
    }
  });

  it("tags the document derivations server, and never browser", () => {
    for (const cls of TIMELINE_NODES as unknown as WithPlatforms[]) {
      if (!SERVER_TIMELINE_NODES.has(cls.nodeType ?? "")) continue;
      expect(cls.platforms).toEqual(["node", "workers", "edge"]);
      expect(supportsPlatform(cls.platforms, "browser")).toBe(false);
    }
  });
});

describe("VIDEO_NODES platform tags", () => {
  it("resolves every video node to ['node'] only (the registry default)", () => {
    for (const cls of VIDEO_NODES as unknown as WithPlatforms[]) {
      // VIDEO_NODES carries no tagger, so each class falls through to the
      // unset default of ["node"].
      expect(effectivePlatforms(cls)).toEqual(["node"]);
    }
  });

  it("never offers a video node to workers / edge / browser", () => {
    for (const cls of VIDEO_NODES as unknown as WithPlatforms[]) {
      expect(supportsPlatform(cls.platforms, "node")).toBe(true);
      expect(supportsPlatform(cls.platforms, "workers")).toBe(false);
      expect(supportsPlatform(cls.platforms, "edge")).toBe(false);
      expect(supportsPlatform(cls.platforms, "browser")).toBe(false);
    }
  });
});
