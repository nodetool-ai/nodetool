import { existsSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import {
  getExampleTimelineBundle,
  installExampleTimeline,
  listExampleTimelines,
  resolveExampleTimelinesDir
} from "../src/lib/example-timelines.js";

const baseNodes = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "../../base-nodes/nodetool");
const examplesDir = nodePath.join(baseNodes, "examples", "nodetool-base");
const options = { examplesDir };

describe("example timelines", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("finds the shipped timeline and its playable media", () => {
    expect(resolveExampleTimelinesDir(options)).toBe(nodePath.join(baseNodes, "examples", "timelines"));
    const examples = listExampleTimelines(options);
    expect(examples).toHaveLength(1);
    const [serein] = examples;
    expect(serein.slug).toBe("serein");
    expect(serein.durationMs).toBe(26000);
    expect(serein.fps).toBe(30);
    expect(serein.clipCount).toBeGreaterThan(0);
    for (const uri of [serein.videoUri, serein.posterUri]) {
      const ref = parsePackageAssetUri(uri);
      expect(ref).not.toBeNull();
      expect(existsSync(nodePath.join(baseNodes, "assets", ref!.packageName, ref!.path))).toBe(true);
    }
    expect(getExampleTimelineBundle(options, "../serein")).toBeNull();
  });

  it("installs an independent editable copy with the accepted cut and scene data", async () => {
    const bundle = getExampleTimelineBundle(options, "serein");
    expect(bundle).not.toBeNull();
    const installed = await installExampleTimeline("user-1", options, {
      slug: "serein",
      projectId: "project-1"
    });
    expect(installed.projectId).toBe("project-1");
    expect(installed.durationMs).toBe(26000);
    expect(installed.clips).toEqual(bundle!.document.clips);
    expect(installed.tracks).toEqual(bundle!.document.tracks);
    const saved = await TimelineSequence.findById(installed.id);
    expect(saved?.user_id).toBe("user-1");
    expect(saved?.toDocument()).toEqual(bundle!.document);
  });
});
