/**
 * Every shipped example that embeds its authoring code should rebake clean:
 * baking `document.source.code` again and merging the result against the
 * shipped document (using the scene hashes the bundle itself recorded)
 * reports zero conflicts and reproduces the same document. That is the
 * contract `set_timeline_code`/`rebake_timeline_code` promise a live
 * timeline, and it is what lets `build.mjs` embed source in the first place
 * — an example whose own script does not rebake clean would be lying about
 * what built it.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { ProcessingContext as ProcessingContextClass } from "@nodetool-ai/runtime";
import {
  getExampleTimelineBundle,
  listExampleTimelines
} from "@nodetool-ai/timeline/examples/node";
import { mergeTimelineSource, type TimelineDocumentLike } from "@nodetool-ai/timeline";
import {
  bakeTimelineCode,
  bakedDocumentMatchesSaved
} from "../src/timeline-code-bake.js";

const discovery = discoverSandboxPack(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "sandbox-packs",
    "sandbox-timeline"
  )
);
if (discovery === undefined) {
  throw new Error("The shipped timeline pack is missing");
}
const catalog = createSandboxModuleCatalog([discovery]);

const context = () =>
  new ProcessingContextClass({
    jobId: "job-example-rebake",
    userId: "u-example-rebake",
    sandboxModuleCatalog: catalog
  });

const slugsWithSource = listExampleTimelines()
  .map((example) => example.slug)
  .filter((slug) => getExampleTimelineBundle({}, slug)?.document.source);

describe("shipped example timelines rebake clean", () => {
  it("found at least one example with embedded source", () => {
    expect(slugsWithSource.length).toBeGreaterThan(0);
  });

  for (const slug of slugsWithSource) {
    it(`${slug}: rebaking its own code reports no conflicts`, async () => {
      const bundle = getExampleTimelineBundle({}, slug)!;
      const source = bundle.document.source!;
      const baked = await bakeTimelineCode(context(), source.code);
      expect(baked.ok, baked.error).toBe(true);

      const merged = mergeTimelineSource(
        bundle.document as unknown as TimelineDocumentLike,
        baked.document!,
        source.scenes
      );
      expect(merged.conflicts).toEqual([]);

      // Every scene the shipped document tracked is still tracked, at the
      // same hash it was baked at — nothing was silently dropped or altered.
      for (const [name, recorded] of Object.entries(source.scenes)) {
        expect(merged.scenes[name]).toEqual(recorded);
      }
    });

    it(`${slug}: the retained program v.save() prints rebuilds the same document`, async () => {
      const code = getExampleTimelineBundle({}, slug)!.document.source!.code;
      const first = await bakeTimelineCode(context(), code);
      expect(first.ok, first.error).toBe(true);
      expect(first.retainedProgram).toBeDefined();

      const second = await bakeTimelineCode(context(), first.retainedProgram!);
      expect(second.ok, second.error).toBe(true);
      expect(
        bakedDocumentMatchesSaved(first.document!, second.document!)
      ).toBe(true);
      // Printing is a fixed point: the program prints itself again.
      expect(second.retainedProgram).toBe(first.retainedProgram);
    });
  }
});
