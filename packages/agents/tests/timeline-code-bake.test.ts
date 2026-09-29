/**
 * Baking a timeline's authoring code — real QuickJS sandbox, no network, no
 * DB row. Pins: a plain `v.save()` script comes back as the document it
 * built; a scene group carries `sourceScene`; `v.save()`'s `ops` option is
 * applied host-side against the captured document (`applyOps`, the same
 * pure op applier `edit_timeline` uses) rather than rejected, so a script
 * using it bakes clean; an op naming something that does not exist still
 * fails cleanly, naming the op; and a script reaching for `el.react()`
 * (which needs a real decode call) fails cleanly rather than silently doing
 * nothing or reaching a real store.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { ProcessingContext as ProcessingContextClass } from "@nodetool-ai/runtime";
import { bakeTimelineCode } from "../src/timeline-code-bake.js";

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
    jobId: "job-timeline-code-bake",
    userId: "u-timeline-code-bake",
    sandboxModuleCatalog: catalog
  });

describe("bakeTimelineCode", () => {
  it("returns the document a plain v.save() built, with sourceScene on the scene group", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
await v.save(nodetool.timelines, { name: "From code" });
`
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    const group = result.document!.clips.find(
      (c) => c.mediaType === "group"
    );
    expect(group?.sourceScene).toBe("one");
  });

  it("applies v.save()'s ops host-side against the captured document", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
await v.save(nodetool.timelines, {
  name: "From code",
  ops: [{ op: "add_marker", timeMs: 500, label: "beat" }]
});
`
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.document!.markers).toEqual([
      expect.objectContaining({ timeMs: 500, label: "beat" })
    ]);
  });

  it("fails cleanly, naming the op, when an op in v.save()'s ops does not exist", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
await v.save(nodetool.timelines, { name: "From code", ops: [{ op: "noop" }] });
`
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("edit_timeline:");
    expect(result.error).toContain("No timeline operation named");
    expect(result.error).toContain("noop");
  });

  it("fails cleanly, through a plain guest throw rather than an engine failure, when the code calls el.react()", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
const saved = await v.save(nodetool.timelines, { name: "From code" });
await nodetool.timelines.bakeAudioAnimation(saved.timeline_id, "audio-clip", "target-clip", {});
`
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/el\.react\(\) bakes an audio-reactive animation/);
  });

  it("fails cleanly when the code never calls v.save()", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
`
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/without calling v\.save/);
  });

  it("fails cleanly when the code calls fetch — a bake is hermetic, no network", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
await fetch("https://example.com");
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
await v.save(nodetool.timelines, { name: "From code" });
`
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/fetch limit exceeded/i);
  });

  const twoSceneCode = (bText) => `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([
  v.scene("a", 1, (s) => { s.text("hello", {}).enter({ from: { opacity: 0 } }); s.rect(10, 10, "#fff"); }),
  v.scene("b", 1, (s) => { s.text("${bText}", {}); })
]);
await v.save(nodetool.timelines, { name: "From code" });
`;

  it("bakes the same code twice to identical clip and animation ids", async () => {
    const first = await bakeTimelineCode(context(), twoSceneCode("bye"));
    const second = await bakeTimelineCode(context(), twoSceneCode("bye"));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const idsOf = (r) => r.document.clips.map((c) => c.id).sort();
    expect(idsOf(second)).toEqual(idsOf(first));
    const animIdsOf = (r) =>
      r.document.clips.flatMap((c) => (c.animations ?? []).map((a) => a.id)).sort();
    expect(animIdsOf(second)).toEqual(animIdsOf(first));
  });

  it("leaves scene a's clip ids unchanged when scene b's text changes", async () => {
    const before = await bakeTimelineCode(context(), twoSceneCode("bye"));
    const after = await bakeTimelineCode(context(), twoSceneCode("farewell"));
    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    const sceneAIds = (r) =>
      r.document.clips
        .filter((c) => c.parentId === "a" || c.id === "a")
        .map((c) => c.id)
        .sort();
    expect(sceneAIds(after)).toEqual(sceneAIds(before));
  });

  it("infers role 'out' for a pure fade-out animate() with no explicit role", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => {
  s.text("bye", {}).animate({ opacity: [1, 0] }, { at: 0.5, dur: 0.5 });
})]);
await v.save(nodetool.timelines, { name: "From code" });
`
    );
    expect(result.ok).toBe(true);
    const text = result.document.clips.find((c) => c.mediaType === "text");
    expect(text.animations[0].role).toBe("out");
  });

  it("keeps role 'in' for a fade-in animate() with no explicit role", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => {
  s.text("hi", {}).animate({ opacity: [0, 1] }, { at: 0, dur: 0.3 });
})]);
await v.save(nodetool.timelines, { name: "From code" });
`
    );
    expect(result.ok).toBe(true);
    const text = result.document.clips.find((c) => c.mediaType === "text");
    expect(text.animations[0].role).toBe("in");
  });

  it("respects an explicit role over the inferred one", async () => {
    const result = await bakeTimelineCode(
      context(),
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => {
  s.text("hi", {}).animate({ opacity: [1, 0] }, { at: 0, dur: 0.3, role: "emphasis" });
})]);
await v.save(nodetool.timelines, { name: "From code" });
`
    );
    expect(result.ok).toBe(true);
    const text = result.document.clips.find((c) => c.mediaType === "text");
    expect(text.animations[0].role).toBe("emphasis");
  });
});
