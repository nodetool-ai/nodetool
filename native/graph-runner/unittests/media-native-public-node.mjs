// The wrapper only prepares input and observes output. RenderTimeline's body is unchanged.
import { BaseNode } from "@nodetool-ai/node-sdk";
import { makeSequence, makeTrack, makeClip } from "@nodetool-ai/timeline";
import { readFile, writeFile } from "node:fs/promises";
import {
  hasEncoder,
  openVideoFrameEncoder,
  probeMedia
} from "@nodetool-ai/runtime/media";
import { PNG } from "./timeline-process-media.mjs";
const { RenderTimelineNode } =
  await import("@nodetool-ai/video-nodes/nodes/timeline");
let calls = 0;
export class MediaNativePublicNode extends BaseNode {
  static nodeType = "fixture.MediaNativePublic";
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { result: "str" };
  constructor(properties = {}) {
    super(properties);
    this.mode = properties.mode ?? "render-video";
  }
  async process(context) {
    calls++;
    if (globalThis.process.env.MEDIA_NATIVE_STALE !== undefined)
      throw new Error("Virtual process environment leaked across public jobs");
    globalThis.process.env.MEDIA_NATIVE_STALE = "set-in-job";
    const root = context.workspaceDir;
    if (!root || context.userId !== "alice")
      throw new Error("Public workspace/user grant was not delivered");
    const path = `${root}/${context.jobId}.mp4`;
    const codec = this.mode === "ungranted" ? "mpeg4" : "libx264";
    const available = await hasEncoder(codec);
    const input = `${root}/${context.jobId}-input.mp4`;
    const encoder = await openVideoFrameEncoder({
      outPath: input,
      width: 8,
      height: 8,
      input: "rgba",
      fps: 1,
      spec: { codec, pixelFormat: "yuv420p", options: { preset: "veryfast" } }
    });
    const red = new Uint8Array(256);
    for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
    try {
      if (this.mode === "cancel") {
        for (let i = 0; i < 1000000; i++) {
          await encoder.write(red);
        }
        throw new Error("Cancellation never reached native encoding");
      }
      await encoder.write(red);
      await encoder.finish();
    } catch (error) {
      await encoder.abort();
      throw error;
    }
    if (this.mode === "codec" || this.mode === "ungranted")
      return {
        result: JSON.stringify({
          path: input,
          bytes: (await readFile(input)).length,
          mode: this.mode,
          available,
          calls,
          jobId: context.jobId,
          probe: await probeMedia(input)
        })
      };
    // Selection must come from the explicit public ContextOptions environment grant.
    if (
      context.environment.NODETOOL_TIMELINE_RENDERER !== "node" ||
      globalThis.process.env.NODETOOL_TIMELINE_RENDERER !== "node"
    )
      throw new Error(
        "Public environmentJson was not applied to virtual process.env"
      );
    const still = this.mode === "render-image";
    const asset = await context.createAsset({
      name: still ? "plain.png" : "red.mp4",
      contentType: still ? "image/png" : "video/mp4",
      content: still ? new Uint8Array(PNG) : await readFile(input)
    });
    const track = makeTrack({ type: "video", name: "Picture", index: 0 });
    const sequence = await context.createTimelineSequence(
      makeSequence({
        name: context.jobId,
        projectId: "default",
        width: 8,
        height: 8,
        fps: 1,
        durationMs: 1000,
        tracks: [track],
        clips: [
          makeClip({
            trackId: track.id,
            mediaType: still ? "image" : "video",
            durationMs: 1000,
            currentAssetId: asset.id,
            status: "generated"
          })
        ]
      })
    );
    let result;
    try {
      result = await Object.assign(new RenderTimelineNode(), {
        timeline: { type: "timeline", id: sequence.id },
        format: "mp4",
        include_audio: false,
        alpha: false,
        preview_scale: 1,
        motion_blur_samples: 1,
        shutter_angle: 180,
        video_codec: "",
        bitrate: 0
      }).process(context);
    } catch (error) {
      console.error(error.stack);
      throw error;
    }
    const ref = result.output;
    const resolved =
      ref.data ?? (await context.resolveAssetBytes(ref.uri ?? ref.asset_id));
    const bytes = resolved?.bytes ?? resolved;
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < 12 ||
      String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp"
    )
      throw new Error("Actual public RenderTimeline did not return MP4 bytes");
    await writeFile(path, bytes);
    return {
      result: JSON.stringify({
        path,
        available,
        calls,
        jobId: context.jobId,
        bytes: bytes.length,
        probe: await probeMedia(path),
        metadata: ref.metadata
      })
    };
  }
}
