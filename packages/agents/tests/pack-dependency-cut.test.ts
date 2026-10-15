import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runHidden(hidden: readonly string[], code: string) {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-agent-dependency-cut-"));
  directories.push(directory);
  const hook = join(directory, "hide.mjs");
  writeFileSync(hook, `import { registerHooks } from 'node:module';
const hidden = ${JSON.stringify(hidden)};
registerHooks({ resolve(specifier, context, next) {
  if (hidden.some((name) => specifier === name || specifier.startsWith(name + '/'))) {
    const error = new Error('Hidden dependency ' + specifier); error.code = 'ERR_MODULE_NOT_FOUND'; throw error;
  }
  return next(specifier, context);
} });`);
  const env = { ...process.env };
  delete env.NODETOOL_OPTIONAL_NODE_MODULES;
  return spawnSync(process.execPath, ["--import", hook, "--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: resolve(import.meta.dirname, "../../.."), env, encoding: "utf8", timeout: 30_000
  });
}

describe("agent dependency cuts", () => {
  it("imports agents without Canvas or the removed node packs", () => {
    const result = runHidden(["@napi-rs/canvas", "@nodetool-ai/blender-nodes", "@nodetool-ai/game-nodes", "@nodetool-ai/game-renderer", "@nodetool-ai/video-nodes"], `
      await import('./packages/agents/src/index.ts');
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it.each([
    ["evals/surfaces/sketch", "createSketchToolBridge()"],
    ["evals/surfaces/creative-pipeline", "createCreativePipelineBridge({ brief: { product: 'test' } })"],
    ["sandbox-media", "getMediaBackend()"],
    ["timeline-preview/rasterize", "PreviewRasterizer.create(1, 1)"],
    ["timeline-preview/compare", "frameDifference(new Uint8Array(), new Uint8Array())"],
    ["timeline-preview/sheet", "composeContactSheet([{ png: new Uint8Array(), label: 'test' }])"],
    ["timeline-preview/frames", "renderTimelineFrames({})"]
  ])("reports imaging details at the %s rendering boundary", (module, call) => {
    const result = runHidden(["@napi-rs/canvas"], `
      import * as surface from './packages/agents/src/${module}.ts';
      try { await surface.${call}; throw new Error('Rendering unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'imaging') throw error;
        if (error.details.missing !== '@napi-rs/canvas') throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("reports missing Blender before attempting a timeline bake", () => {
    const result = runHidden(["@nodetool-ai/blender-nodes"], `
      import { bakeModel3DClipOnServer } from './packages/agents/src/capabilities/timeline-bake.ts';
      try { await bakeModel3DClipOnServer({}, {}); throw new Error('Baking unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingPackError' || error.details.error !== 'missing_pack' || !error.details.packs.some((pack) => pack.id === 'blender')) throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("reports the missing game pack for a renderer provided by that pack", () => {
    const result = runHidden(["@nodetool-ai/game-renderer"], `
      import { captureFrames3D } from './packages/agents/src/capabilities/game3d.ts';
      try { await captureFrames3D({}, '', {}, [], [], 0, {}); throw new Error('Capture unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingPackError' || error.details.error !== 'missing_pack' || !error.details.packs.some((pack) => pack.id === 'game')) throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);
});
