import '../guest/env/index.mjs';
import { Buffer } from 'buffer/';
import { GuestContext } from '../guest/host/context.mjs';
const { RenderTimelineNode } = await import('@nodetool-ai/video-nodes/nodes/timeline');
import { makeSequence, makeTrack, makeClip } from '@nodetool-ai/timeline';
import { PNG } from './timeline-process-media.mjs';
globalThis.Buffer ??= Buffer;
const root = globalThis.__timelineRoot;
const context = new GuestContext({ userId: 'alice', modelOptions: { databasePath: `${root}/timeline.sqlite`, assetRoot: `${root}/assets` }, environment: { NODETOOL_TIMELINE_RENDERER: 'node' } });
const asset = await context.createAsset({ name: 'plain.png', contentType: 'image/png', content: new Uint8Array(PNG) });
const track = makeTrack({ type: 'video', name: 'Picture', index: 0 });
const sequence = await context.createTimelineSequence(makeSequence({ name: 'One plain frame', projectId: 'default', width: 8, height: 8, fps: 1, durationMs: 1000,
  tracks: [track], clips: [makeClip({ trackId: track.id, mediaType: 'image', durationMs: 1000, currentAssetId: asset.id, status: 'generated' })] }));
try {
  const result = await Object.assign(new RenderTimelineNode(), { timeline: { type: 'timeline', id: sequence.id }, format: 'mp4', include_audio: false,
    alpha: false, preview_scale: 1, motion_blur_samples: 1, shutter_angle: 180, video_codec: '', bitrate: 0 }).process(context);
  const ref = result.output;
  const resolved = ref.data ?? await context.resolveAssetBytes(ref.uri ?? ref.asset_id);
  const bytes = resolved?.bytes ?? resolved;
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') throw new Error('RenderTimeline returned no verified MP4 encoded bytes');
  globalThis.__timelineResult = JSON.stringify({ encodedBytes: bytes.length, magic: 'ftyp' });
  globalThis.__timelineChecks = 1;
} finally { context._models.close(); }
globalThis.__nodetool = {};
