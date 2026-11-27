/**
 * `render_model3d_reference` on the server: a 3D clip's span rendered as a
 * grey reference video with no browser open (Blockout 3D).
 *
 * The op in `@nodetool-ai/timeline` decides whether a render is needed and
 * what hash it is stored under. This is the half that needs bytes and a
 * renderer. It reads the clip's glTF, asks the timeline for one model time and
 * one camera per output frame, draws them in the headless three.js host with
 * the chosen pass, encodes the PNGs to MP4 in process, and persists the video
 * as a generation, so it shows up in the run's asset trail like a bake does.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { importPack } from "@nodetool-ai/node-catalog";
import { animationDurations, parseModel3D } from "@nodetool-ai/model3d";
import { model3dReferenceSession } from "@nodetool-ai/timeline";
import { computeModel3DReferenceFrames } from "@nodetool-ai/timeline/scene";
import type {
  TimelineOpRenderModel3DReferenceRequest,
  TimelineOpRenderModel3DReferenceResult
} from "@nodetool-ai/timeline/ops";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { openVideoFrameEncoder } from "@nodetool-ai/runtime/media";

/**
 * Frames handed to the headless host per call. One call returns every PNG of
 * its batch in a single reply, so the batch bounds that reply and gives a
 * cancel a place to land between batches.
 */
const FRAMES_PER_BATCH = 24;

/** H.264 at 4:2:0, the format every reference-video provider reads. */
const REFERENCE_ENCODER = {
  codec: "libx264",
  pixelFormat: "yuv420p",
  options: { preset: "veryfast", crf: "18" }
} as const;

/**
 * Render one clip's reference and store it. Throws with the cause named, and
 * the op surfaces it to the caller unchanged.
 */
export async function renderModel3DReferenceOnServer(
  context: ProcessingContext,
  request: TimelineOpRenderModel3DReferenceRequest
): Promise<TimelineOpRenderModel3DReferenceResult> {
  const { clip, sequence, pass } = request;
  const assetId = clip.currentAssetId;
  if (!assetId) {
    throw new Error(`Clip "${clip.name}" has no glTF asset to render.`);
  }
  const style = clip.model3dStyle;
  if (!style) {
    throw new Error(`Clip "${clip.name}" has no model3dStyle to render.`);
  }
  // The encoder writes a file. A run in a project uses the project's scratch
  // directory, and a run with no workspace (the CLI) uses the system's.
  const workspace = context.workspace;
  const glb = await loadMediaRefBytes(
    { uri: `asset://${assetId}`, asset_id: assetId },
    context
  );
  if (!glb || glb.length === 0) {
    throw new Error(`3D model ${assetId} has no stored bytes to render.`);
  }

  const durations = animationDurations(parseModel3D(glb).json);
  const frames = computeModel3DReferenceFrames(clip, sequence, durations, pass);
  const session = model3dReferenceSession(style);
  const { width, height } = frames[0];
  const fps = Math.max(1, Math.round(sequence.fps));

  const generationId = randomUUID();
  const generation = await context.runGenerationWith(
    {
      id: generationId,
      provider: "three",
      capability: "render_model3d_reference",
      model: "render_session",
      params: {
        model_id: assetId,
        clip_id: clip.id,
        pass,
        frames: frames.length,
        fps,
        width,
        height,
        dependency_hash: request.dependencyHash
      },
      origin: { surface: "capability", tool_call_id: null },
      persist: {
        name: `${clip.name || "clip"}-reference-${pass}.mp4`,
        mime: "video/mp4"
      }
    },
    async (_provider, signal) => {
      // Imported here so a timeline edit with no reference render never loads
      // three.js, chrome-launcher or the render page bundle.
      const { renderGlbFramesHeadless } = await importPack<
        typeof import("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless")
      >("video", "@nodetool-ai/video-nodes/nodes/model3d/render3d-headless");
      const cwd = await mkdtemp(
        path.join(
          workspace ? await workspace.scratchDir() : tmpdir(),
          "nodetool-reference-"
        )
      );
      try {
        const output = path.join(cwd, "reference.mp4");
        const encoder = await openVideoFrameEncoder({
          outPath: output,
          fps,
          input: "png",
          spec: REFERENCE_ENCODER,
          muxerOptions: { movflags: "+faststart" },
          signal
        });
        try {
          for (let start = 0; start < frames.length; start += FRAMES_PER_BATCH) {
            signal.throwIfAborted();
            const batch = frames.slice(start, start + FRAMES_PER_BATCH);
            const pngs = await renderGlbFramesHeadless(glb, session, batch);
            if (pngs.length !== batch.length) {
              throw new Error(
                `The renderer returned ${pngs.length} images for ${batch.length} frames.`
              );
            }
            for (const png of pngs) {
              await encoder.write(png);
            }
          }
          await encoder.finish();
        } catch (error) {
          await encoder.abort();
          throw error;
        }
        return new Uint8Array(await readFile(output));
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
    { withoutProvider: true }
  );

  const videoAssetId = generation.assets[0]?.asset_id;
  if (!videoAssetId) {
    throw new Error(
      `The reference render of clip "${clip.name}" could not be stored.`
    );
  }
  return { assetId: videoAssetId, jobId: generationId };
}
