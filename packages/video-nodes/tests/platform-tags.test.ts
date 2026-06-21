/**
 * Platform-tag regression tests for the video-nodes registration arrays.
 *
 * TIMELINE_NODES and VIDEO_NODES both shell out to ffmpeg/ffprobe and write
 * os.tmpdir() temp files, so they can only run on the full Node tier — never
 * on the V8-isolate (workers/edge) or browser runtimes, which have no
 * subprocess and no filesystem. These tests lock that in: a future accidental
 * tagAsServer / tagAsUniversal on either group would fail here loudly.
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

describe("TIMELINE_NODES platform tags", () => {
  it("tags every timeline node as ['node'] only", () => {
    for (const cls of TIMELINE_NODES as unknown as WithPlatforms[]) {
      // tagAsNode stamps platforms explicitly, so the raw value is ['node'].
      expect(cls.platforms).toEqual(["node"]);
      expect(effectivePlatforms(cls)).toEqual(["node"]);
    }
  });

  it("never offers a timeline node to workers / edge / browser", () => {
    for (const cls of TIMELINE_NODES as unknown as WithPlatforms[]) {
      expect(supportsPlatform(cls.platforms, "node")).toBe(true);
      expect(supportsPlatform(cls.platforms, "workers")).toBe(false);
      expect(supportsPlatform(cls.platforms, "edge")).toBe(false);
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
