import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExampleTimelineBundle,
  getExampleTimelineSource,
  listExampleTimelines,
  resolveExampleTimelinesDir
} from "../src/examples/node.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function stagedDirectory(): string {
  const root = mkdtempSync(
    nodePath.join(tmpdir(), "nodetool-example-timelines-")
  );
  roots.push(root);
  const dir = nodePath.join(root, "examples", "timelines");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const bundle = {
  name: "Staged example",
  description: "An installed timeline reference",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 1000,
  posterUri: "package://nodetool-base/timelines/staged/poster.jpg",
  videoUri: "package://nodetool-base/timelines/staged/ad.mp4",
  document: { tracks: [], clips: [], markers: [] }
};

describe("shared example timeline reader", () => {
  it("reads installed bundles without a repository filesystem", () => {
    const dir = stagedDirectory();
    writeFileSync(
      nodePath.join(dir, "staged.timeline.json"),
      JSON.stringify(bundle)
    );
    vi.stubEnv("NODETOOL_EXAMPLE_TIMELINES_DIR", dir);
    const catalog = listExampleTimelines();
    expect(catalog.map((entry) => entry.slug)).toEqual(["staged"]);
    expect(getExampleTimelineBundle({}, catalog[0]!.slug)).toMatchObject(
      bundle
    );
    const options = {
      examplesDir: nodePath.join(nodePath.dirname(dir), "nodetool-base")
    };
    expect(resolveExampleTimelinesDir(options)).toBe(dir);
    expect(listExampleTimelines(options)).toEqual(catalog);
    for (const slug of ["stage", "../staged", "staged.timeline.json"]) {
      expect(getExampleTimelineBundle({}, slug)).toBeNull();
    }
  });

  it("skips malformed bundles and refuses unavailable explicit directories", () => {
    const dir = stagedDirectory();
    writeFileSync(
      nodePath.join(dir, "invalid.timeline.json"),
      JSON.stringify({ ...bundle, fps: 0 })
    );
    vi.stubEnv("NODETOOL_EXAMPLE_TIMELINES_DIR", dir);
    expect(listExampleTimelines()).toEqual([]);
    expect(getExampleTimelineBundle({}, "invalid")).toBeNull();
    vi.stubEnv("NODETOOL_EXAMPLE_TIMELINES_DIR", nodePath.join(dir, "missing"));
    expect(resolveExampleTimelinesDir()).toBeNull();
    expect(listExampleTimelines()).toEqual([]);
  });

  it("reads the builder script out of the bundle's own document.source, with its imports listed", () => {
    const dir = stagedDirectory();
    const code =
      'import { createBuilder, saveTimeline } from "@nodetool-ai/sandbox-timeline";\n' +
      'import { helper } from "./helper.mjs";\n' +
      "createBuilder({ W: 1920, H: 1080, FPS: 30 });\n";
    writeFileSync(
      nodePath.join(dir, "staged.timeline.json"),
      JSON.stringify({
        ...bundle,
        document: {
          ...bundle.document,
          source: { lang: "js", code, bakedAt: "2026-01-01T00:00:00.000Z", scenes: {} }
        }
      })
    );
    vi.stubEnv("NODETOOL_EXAMPLE_TIMELINES_DIR", dir);
    expect(getExampleTimelineSource({}, "staged")).toMatchObject({
      slug: "staged",
      source: expect.stringContaining("createBuilder"),
      imports: ["@nodetool-ai/sandbox-timeline", "./helper.mjs"]
    });
    expect(getExampleTimelineSource({}, "no-such-slug")).toBeNull();
  });

  it("answers null for an example with no document.source", () => {
    const dir = stagedDirectory();
    writeFileSync(nodePath.join(dir, "no-source.timeline.json"), JSON.stringify(bundle));
    vi.stubEnv("NODETOOL_EXAMPLE_TIMELINES_DIR", dir);
    expect(getExampleTimelineSource({}, "no-source")).toBeNull();
  });
});
