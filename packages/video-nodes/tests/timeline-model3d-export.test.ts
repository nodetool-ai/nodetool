import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeSequence,
  makeTrack
} from "@nodetool-ai/timeline";
import { renderGlbFramesHeadless } from "../src/nodes/model3d/render3d-headless.js";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { openFrameEncoder } from "../src/nodes/timeline/rawFrames.js";
import { createAnimatedGlb } from "./_fixtures/model3d-glb.js";

const SIZE = 32;
let directory = "";
let modelFile = "";
let bakeFile = "";
let firstPixels: Uint8Array;
let secondPixels: Uint8Array;
const track = makeTrack({ id: "models", type: "video" });
function sequence() {
  return makeSequence({
    width: SIZE,
    height: SIZE,
    fps: 2,
    durationMs: 1000,
    tracks: [track],
    clips: [
      makeClip({
        id: "model",
        name: "Asymmetric GLB",
        trackId: track.id,
        mediaType: "model3d",
        status: "generated",
        currentAssetId: "owned-model",
        startMs: 0,
        durationMs: 1000,
        inPointMs: 1000,
        speedMultiplier: 2,
        model3dStyle: {
          ...structuredClone(DEFAULT_MODEL3D_STYLE),
          lighting: "flat",
          background: { transparent: false, color: "#15314b" },
          animation: { clipName: "slide", loop: false, speed: 1 }
        }
      })
    ]
  });
}
async function rgba(png: Uint8Array) {
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext("2d").drawImage(await loadImage(png), 0, 0);
  return new Uint8Array(
    canvas.getContext("2d").getImageData(0, 0, SIZE, SIZE).data
  );
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "timeline-model3d-export-"));
  modelFile = join(directory, "model.glb");
  bakeFile = join(directory, "bake.mkv");
  const glb = createAnimatedGlb();
  await writeFile(modelFile, glb);
  const pngs = await renderGlbFramesHeadless(
    glb,
    {
      lighting: "flat",
      lightIntensity: 1,
      background: { transparent: false, color: "#15314b" },
      animation: { clipName: "slide", loop: false, speed: 1 }
    },
    [1, 2].map((timeSec) => ({
      timeSec,
      width: SIZE,
      height: SIZE,
      camera: {
        mode: "orbit",
        azimuthDeg: 0,
        elevationDeg: 0,
        fovDeg: 35,
        zoom: 1
      }
    }))
  );
  firstPixels = await rgba(pngs[0]);
  secondPixels = await rgba(pngs[1]);
  expect(firstPixels).not.toEqual(secondPixels);
  const encoder = openFrameEncoder({
    outPath: bakeFile,
    width: SIZE,
    height: SIZE,
    fps: 2,
    encoderArgs: ["-c:v", "ffv1", "-pix_fmt", "bgra"]
  });
  await encoder.write(firstPixels);
  await encoder.write(secondPixels);
  await encoder.finish();
}, 120_000);
afterAll(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function render(doc: ReturnType<typeof sequence>) {
  const resolveAssetPath = vi.fn(async (id: string) =>
    id === "fresh-bake" ? bakeFile : modelFile
  );
  const pixels: Uint8Array[] = [];
  const result = await renderTimelineComposited({
    sequence: doc,
    width: SIZE,
    height: SIZE,
    fps: 2,
    durationMs: 1000,
    resolveAssetPath,
    outPath: "unused",
    writeFrame: async (_index, frame) => {
      pixels.push(frame);
    }
  });
  return { result, pixels, resolveAssetPath };
}
describe("server model3d timeline export", () => {
  it("decodes a fresh real GLB bake from clip-local zero despite source trim and speed", async () => {
    const doc = sequence();
    const clip = doc.clips[0];
    clip.model3dStyle = {
      ...clip.model3dStyle!,
      bake: {
        assetId: "fresh-bake",
        dependencyHash: computeModel3DBakeHash(clip, doc)
      }
    };
    const rendered = await render(doc);
    expect(rendered.result).toMatchObject({ complete: true, diagnostics: [] });
    expect(rendered.resolveAssetPath.mock.calls).toEqual([["fresh-bake"]]);
    expect(rendered.pixels[0]).toEqual(firstPixels);
    expect(rendered.pixels[1]).toEqual(secondPixels);
  }, 120_000);
  it.each([false, true])(
    "explicitly refuses live or stale-bake 3D without attempting image decode, stale=%s",
    async (stale) => {
      const doc = sequence();
      if (stale) {
        doc.clips[0].model3dStyle = {
          ...doc.clips[0].model3dStyle!,
          bake: { assetId: "fresh-bake", dependencyHash: "stale" }
        };
      }
      const rendered = await render(doc);
      expect(rendered.result).toMatchObject({
        complete: false,
        diagnostics: [{ clipId: "model", reason: "unsupported_layer" }]
      });
      expect(rendered.resolveAssetPath).not.toHaveBeenCalled();
    }
  );
});
