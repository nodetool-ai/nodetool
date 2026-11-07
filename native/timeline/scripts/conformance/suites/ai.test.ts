import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { captureMediaEditSourceContext, createMediaEditRequest, mediaEditGenerateMediaData } from '../../../../../packages/timeline/src/generative';
import { createExtensionRequest, extensionGenerateMediaData } from '../../../../../packages/timeline/src/extensionRequest';
import { applyExtensionToClips, captureExtensionSource } from '../../../../../packages/timeline/src/extension';
import { createLineDeliveryRequest, lineDeliveryGenerateMediaData } from '../../../../../packages/timeline/src/lineDelivery';
import { applyTakeToClip } from '../../../../../packages/timeline/src/takes';
import { imageToVideoSettings } from '../../../../../web/src/hooks/timeline/imageToVideoSettings';
import type { ClipVersion, TimelineClip } from '../../../../../packages/timeline/src/types';

const binary = process.env.NT_AI_ORACLE;
function native(cases: unknown[]): unknown[] {
  if (!binary) throw new Error('NT_AI_ORACLE is required');
  return JSON.parse(execFileSync(binary, [], { input: JSON.stringify(cases), encoding: 'utf8', timeout: 10000 }));
}
const clean = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const versionMetadata = { createdAt: '2020-01-01T00:00:00.000Z', jobId: '',
  workflowUpdatedAt: '2020-01-01T00:00:00.000Z', dependencyHash: '', paramOverridesSnapshot: {} };
const clip: TimelineClip = { id: 'clip', trackId: 'v', name: 'Clip', mediaType: 'video', sourceType: 'imported', currentAssetId: 'asset',
  startMs: 4000, durationMs: 4000, inPointMs: 1000, outPointMs: 5000, speedMultiplier: 1, status: 'generated', locked: false,
  versions: [{ ...versionMetadata, id: 'original', assetId: 'asset', status: 'success' },
    { ...versionMetadata, id: 'candidate', assetId: 'new', status: 'success', source: 'extended', durationMs: 6000 }] };
const model = { id: 'model', provider: 'provider', supportedTasks: ['extend_video', 'extend_video_end'], durations: [2, 4] };
const options = { direction: 'end' as const, addedSourceDurationMs: 2000, prompt: 'continue' };
const extension = createExtensionRequest({ clip, sequenceId: 'sequence', requestId: 'request', model, ...options });

it('constructs video edit and extension requests like the timeline package', () => {
  const edit = { instruction: 'repaint', provider: 'provider', model: 'model', referenceAssetIds: ['r1', 'r1', 'r2'], entityIds: ['e'] };
  const source = captureMediaEditSourceContext('sequence', clip);
  if (!source.ok) throw new Error(source.error);
  const editRequest = createMediaEditRequest({ sourceContext: source.context, ...edit });
  const cases = [
    { op: 'mediaEdit', sequenceId: 'sequence', clip, options: edit },
    { op: 'extensionRequest', sequenceId: 'sequence', requestId: 'request', clip, model, options },
    { op: 'mediaEdit', sequenceId: 'sequence', clip: { ...clip, speedMultiplier: 2 }, options: edit },
    { op: 'extensionRequest', sequenceId: 'sequence', requestId: 'request', clip, model, options: { ...options, direction: 'start' } },
    { op: 'extensionRequest', sequenceId: 'sequence', requestId: 'request', clip, model, options: { ...options, addedSourceDurationMs: 3000 } }
  ];
  const retimed = captureMediaEditSourceContext('sequence', { ...clip, speedMultiplier: 2 });
  expect(retimed.ok).toBe(false);
  expect(() => createExtensionRequest({ clip, sequenceId: 'sequence', requestId: 'request', model, ...options, direction: 'start' })).toThrow();
  expect(() => createExtensionRequest({ clip, sequenceId: 'sequence', requestId: 'request', model, ...options, addedSourceDurationMs: 3000 })).toThrow();
  expect(native(cases)).toEqual(clean([
    { ok: true, snapshot: editRequest, data: mediaEditGenerateMediaData(editRequest) },
    { ok: true, snapshot: extension, data: extensionGenerateMediaData(extension) },
    { ok: false }, { ok: false }, { ok: false }
  ]));
});

it('applies extension timing and refuses stale or blocked edits like the timeline package', () => {
  const captured = captureExtensionSource(clip);
  if (!captured.ok) throw new Error(captured.error);
  const downstream: TimelineClip = { id: 'downstream', trackId: 'v', name: 'Downstream', startMs: 8000, durationMs: 1000, mediaType: 'video', sourceType: 'imported', status: 'draft', locked: false, versions: [] };
  const base = { clips: [clip, downstream], source: captured.source, takeId: 'candidate', direction: 'end' as const, addedSourceDurationMs: 2000 };
  const variants = [
    { ...base, timing: 'keep-cut' as const }, { ...base, timing: 'available-space' as const },
    { ...base, timing: 'ripple' as const }, { ...base, timing: 'keep-cut' as const, source: { ...base.source, sourceAssetId: 'old' } },
    { ...base, timing: 'ripple' as const, lockedTrackIds: ['v'] },
    { ...base, timing: 'keep-cut' as const, addedSourceDurationMs: 3000 }
  ];
  const expected = variants.map(({ lockedTrackIds, ...variant }) => {
    const result = applyExtensionToClips({ ...variant, ...(lockedTrackIds && { lockedTrackIds: new Set(lockedTrackIds) }) });
    return result.ok ? { ok: true, clips: result.clips } : { ok: false, code: result.code };
  });
  expect(native(variants.map(variant => ({ op: 'extension', ...variant })))).toEqual(clean(expected));
});

it('maps script delivery, including cast voice and speed, to the same payload', () => {
  const input = { scriptId: 's', line: { id: 'l', text: ' hello ', speakerId: 'actor', direction: 'soft', targetDurationMs: 2500 },
    castMember: { id: 'actor', voice: { provider: 'p', model: 'm', voice: 'v' } }, pace: 'slow' as const };
  const result = createLineDeliveryRequest(input);
  if (!result.ok) throw new Error(result.error);
  expect(createLineDeliveryRequest({ ...input, speed: 5 }).ok).toBe(false);
  expect(native([{ op: 'lineDelivery', input }, { op: 'lineDelivery', input: { ...input, speed: 5 } }])).toEqual(clean([
    { ok: true, snapshot: result.request, data: lineDeliveryGenerateMediaData(result.request) }, { ok: false }
  ]));
});

it('uses the image duration and model framing defaults', () => {
  const image = { id: 'image', mediaType: 'image', currentAssetId: 'asset', startMs: 200, durationMs: 4200 };
  const limits = { durations: [4, 8], aspectRatios: ['1:1', '16:9'], resolutions: ['720p', '1080p'] };
  const settings = imageToVideoSettings({ ...image, width: 1920, height: 1080 }, limits);
  const request = { op: 'imageVideo', sequenceId: 'sequence', clip: image,
    model: { ...limits, id: 'model', provider: 'p' }, options: { targetClipId: 'target', prompt: 'animate', width: 1920, height: 1080 } };
  expect(native([request])).toEqual([{ ok: true, snapshot: { sourceClipId: 'image', sourceAssetId: 'asset', targetClipId: 'target', sequenceId: 'sequence', provider: 'p', model: 'model', prompt: 'animate', ...settings, startMs: 200 },
    data: { mode: 'video', provider: 'p', model: 'model', prompt: 'animate', source_asset_id: 'asset', timeline_context: { sequence_id: 'sequence', source_clip_id: 'image', target_clip_id: 'target' }, duration: settings.requestSeconds, variations: 1, aspect_ratio: settings.aspectRatio, resolution: settings.resolution } }]);
});

it('applies successful takes and rejects shorter or extended results', () => {
  const versions: ClipVersion[] = [
    { ...versionMetadata, id: 'new-take', assetId: 'new', status: 'success', durationMs: 4000, dependencyHash: 'hash',
      mediaEdit: { action: 'video_edit', modelTask: 'video_to_video', requestId: 'request', instruction: 'edit', provider: 'provider', model: 'model',
        sourceContext: { sequenceId: 'sequence', clipId: 'clip', sourceAssetId: 'asset', sourceStartMs: 1000, sourceEndMs: 5000,
          timelineStartMs: 4000, timelineDurationMs: 4000, speedMultiplier: 1 } } },
    { ...versionMetadata, id: 'short', assetId: 'short', status: 'success', durationMs: 3999 },
    { ...versionMetadata, id: 'extended', assetId: 'extended', status: 'success', source: 'extended', durationMs: 6000 }
  ];
  const subject: TimelineClip = { ...clip, dependencyHash: 'hash', versions };
  const ids = versions.map(v => v.id);
  const expected = ids.map(id => { const result = applyTakeToClip(subject, id); return result.error ? { ok: false } : { ok: true, clip: result.clip }; });
  expect(native(ids.map(takeId => ({ op: 'take', clip: subject, takeId })))).toEqual(clean(expected));
});
