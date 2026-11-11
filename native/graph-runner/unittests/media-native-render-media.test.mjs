// Real RenderTimeline over a generated two-frame video and a real audio asset.
import "../guest/env/webassembly.mjs";
import "./media-native.test.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { GuestContext } from "../guest/host/context.mjs";
import { makeSequence, makeTrack, makeClip } from "@nodetool-ai/timeline";
import { probeMedia, decodeAudioToPcm } from "../guest/host/media-native.mjs";
const { RenderTimelineNode } =
  await import("@nodetool-ai/video-nodes/nodes/timeline");
globalThis.process.env.NODETOOL_TIMELINE_RENDERER = "node";
const root = globalThis.__timelineRoot;
const context = new GuestContext({
  userId: "alice",
  modelOptions: {
    databasePath: `${root}/timeline.sqlite`,
    assetRoot: `${root}/assets`
  }
});
try {
  const picture = await context.createAsset({
    name: "two-frames.mp4",
    contentType: "video/mp4",
    content: await readFile(`${root}/frames.mp4`)
  });
  const sound = await context.createAsset({
    name: "tone.wav",
    contentType: "audio/wav",
    content: await readFile(`${root}/tone.wav`)
  });
  const videoTrack = makeTrack({ type: "video", name: "Video", index: 0 });
  const audioTrack = makeTrack({ type: "audio", name: "Audio", index: 1 });
  const sequence = await context.createTimelineSequence(
    makeSequence({
      name: "Video with sound",
      projectId: "default",
      width: 8,
      height: 8,
      fps: 1,
      durationMs: 2000,
      tracks: [videoTrack, audioTrack],
      clips: [
        makeClip({
          trackId: videoTrack.id,
          mediaType: "video",
          durationMs: 2000,
          currentAssetId: picture.id,
          status: "generated"
        }),
        makeClip({
          trackId: audioTrack.id,
          mediaType: "audio",
          startMs: 0,
          durationMs: 1000,
          currentAssetId: sound.id,
          status: "generated"
        })
      ]
    })
  );
  const result = await Object.assign(new RenderTimelineNode(), {
    timeline: { type: "timeline", id: sequence.id },
    format: "mp4",
    include_audio: true,
    alpha: false,
    preview_scale: 1,
    motion_blur_samples: 1,
    shutter_angle: 180,
    video_codec: "",
    bitrate: 0
  }).process(context);
  const ref = result.output;
  const resolved =
    ref.data ?? (await context.resolveAssetBytes(ref.uri ?? ref.asset_id));
  const bytes = resolved?.bytes ?? resolved;
  if (
    !(bytes instanceof Uint8Array) ||
    String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp"
  )
    throw new Error("No encoded MP4");
  await writeFile(`${root}/timeline-audio-video.mp4`, bytes);
  const probe = await probeMedia(`${root}/timeline-audio-video.mp4`);
  const audio = await decodeAudioToPcm(`${root}/timeline-audio-video.mp4`, {
    sampleRate: 48000,
    channels: 1
  });
  if (
    probe.video.width !== 8 ||
    probe.audio.channels !== 2 ||
    !audio.samples.some((x) => x > 0.05)
  )
    throw new Error("Timeline output has no actual audio/video");

  const one = await context.createTimelineSequence(
    makeSequence({
      name: "One native frame",
      projectId: "default",
      width: 8,
      height: 8,
      fps: 1,
      durationMs: 1000,
      tracks: [videoTrack],
      clips: [
        makeClip({
          trackId: videoTrack.id,
          mediaType: "video",
          durationMs: 1000,
          currentAssetId: picture.id,
          status: "generated"
        })
      ]
    })
  );
  const single = await Object.assign(new RenderTimelineNode(), {
    timeline: { type: "timeline", id: one.id },
    format: "mp4",
    include_audio: false,
    alpha: false,
    preview_scale: 1,
    motion_blur_samples: 1,
    shutter_angle: 180,
    video_codec: "",
    bitrate: 0
  }).process(context);
  const singleRef = single.output;
  const singleResolved =
    singleRef.data ??
    (await context.resolveAssetBytes(singleRef.uri ?? singleRef.asset_id));
  const singleBytes = singleResolved?.bytes ?? singleResolved;
  if (
    !(singleBytes instanceof Uint8Array) ||
    String.fromCharCode(...singleBytes.slice(4, 8)) !== "ftyp"
  )
    throw new Error("No single-frame MP4");
  await writeFile(`${root}/timeline-one-frame.mp4`, singleBytes);
  const singleProbe = await probeMedia(`${root}/timeline-one-frame.mp4`);
  if (
    singleProbe.durationSec !== 1 ||
    singleProbe.video.width !== 8 ||
    singleProbe.video.height !== 8
  )
    throw new Error(`Single-frame duration or dimensions mismatch: ${JSON.stringify(singleProbe)}`);
  globalThis.__timelineChecks += 1;
  globalThis.__timelineResult = JSON.stringify({
    encodedBytes: bytes.length,
    probe,
    metadata: ref.metadata,
    singleFrameBytes: singleBytes.length,
    singleProbe
  });
} catch (error) {
  console.error(error.stack);
  throw error;
} finally {
  context._models.close();
}
globalThis.__nodetool = {};
