import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { applyTakeToClip, deleteTake, makeClip, makeClipVersion, renameTake, splitClip } from '@nodetool-ai/timeline';
import { timelineDocument } from '../../../../packages/protocol/src/api-schemas/timeline';

const original = makeClipVersion({ createdAt: '2020-01-01T00:00:00.000Z', workflowUpdatedAt: '2020-01-01T00:00:00.000Z', id: 'original', assetId: 'asset-original', status: 'success',
  durationMs: 4000, dependencyHash: 'base', paramOverridesSnapshot: { seed: 1 } });
const candidate = makeClipVersion({ createdAt: '2020-01-02T00:00:00.000Z', workflowUpdatedAt: '2020-01-02T00:00:00.000Z', id: 'candidate', assetId: 'asset-new', status: 'success',
  durationMs: 5000, dependencyHash: 'new', paramOverridesSnapshot: { seed: 2 } });
const clip = makeClip({ id: 'clip', name: 'Clip', mediaType: 'video', durationMs: 4000,
  currentAssetId: 'asset-original', activeTakeId: 'candidate', dependencyHash: 'base',
  inPointMs: 200, outPointMs: 4200, versions: [original, candidate] });

describe('native take operations against timeline rules', () => {
  // Number keys build on the same take rules. Their documents must read back
  // unchanged through the server schema, and give the clips the web computes.
  it('switches and cuts to documents the web reads the same way', () => {
    const shot = { ...clip, trackId: 'track', startMs: 1000, currentAssetId: 'asset-original', activeTakeId: 'original',
      opacity: 0.5, fadeInMs: 100, fadeOutMs: 300, transform: { position: { x: 4, y: 8 }, scale: { x: 1, y: 1 }, rotation: 12, anchor: { x: 0.5, y: 0.5 } } };
    const binary = process.env.NT_AI_TAKE_ORACLE;
    if (!binary) throw new Error('NT_AI_TAKE_ORACLE is required');
    const run = (request: Record<string, unknown>) => (JSON.parse(execFileSync(binary, [JSON.stringify([{ clips: [shot], id: 'clip', index: 1, ...request }])],
      { encoding: 'utf8', timeout: 10000 })) as Array<{ clips: Array<typeof shot & { id: string }>; resultId: string; failed: boolean }>)[0]!;
    const document = (clips: unknown[]) => ({ id: 'doc', projectId: 'project', name: 'Doc', fps: 30, width: 1920, height: 1080, durationMs: 9000,
      tracks: [{ id: 'track', name: 'Video', type: 'video', index: 0, visible: true, locked: false, muted: false, solo: false, heightPx: 80 }], clips, markers: [] });
    const readsBack = (clips: unknown[]) => {
      const input = document(clips);
      const parsed = timelineDocument.safeParse(input);
      expect(parsed.success, parsed.success ? '' : parsed.error.message).toBe(true);
      if (parsed.success) { expect(parsed.data.clips).toEqual(clips); }
    };
    const switched = run({ op: 'switch' });
    expect(switched.failed).toBe(false);
    expect(switched.clips).toEqual([applyTakeToClip(shot, 'candidate').clip]);
    readsBack(switched.clips);

    const cut = run({ op: 'cut', timeMs: 3000 });
    expect(cut.failed).toBe(false);
    expect(cut.clips).toHaveLength(2);
    const [webLeft, webRight] = splitClip(applyTakeToClip(shot, 'candidate').clip, 3000);
    const [originalLeft] = splitClip(shot, 3000);
    const right = cut.clips.find((part) => part.id === cut.resultId)!;
    const left = cut.clips.find((part) => part.id !== cut.resultId)!;
    expect({ ...right, id: '' }).toEqual({ ...webRight, id: '' });
    expect({ ...left, id: '' }).toEqual({ ...originalLeft, id: '' });
    expect(webLeft.currentAssetId).toBe('asset-new');
    readsBack(cut.clips);
  });

  it('matches take application and history across accepted and refused cases', () => {
    const withCandidate = (patch: Record<string, unknown>) => ({ ...clip, versions: [original, { ...candidate, ...patch }] });
    const requests = [
      { op: 'apply', clip, id: 'candidate' },
      { op: 'apply', clip: withCandidate({ durationMs: 3999 }), id: 'candidate' },
      { op: 'apply', clip: withCandidate({ status: 'failed' }), id: 'candidate' },
      { op: 'apply', clip: withCandidate({ source: 'extended' }), id: 'candidate' },
      { op: 'apply', clip: withCandidate({ durationMs: 9000, sourceMapping: { inPointMs: 1000, outPointMs: 9000, speedMultiplier: 2 } }), id: 'candidate' },
      { op: 'apply', clip: withCandidate({ sourceMapping: { inPointMs: 0, outPointMs: 5000 } }), id: 'candidate' },
      { op: 'apply', clip: withCandidate({ mediaEdit: { instruction: 'edit' } }), id: 'candidate' },
      { op: 'apply', clip: { ...clip, mediaType: 'model3d' }, id: 'candidate' },
      { op: 'apply', clip, id: 'missing' },
      { op: 'rename', clip, id: 'candidate', label: 'Alternative' },
      { op: 'rename', clip, id: 'missing', label: 'Alternative' },
      { op: 'delete', clip, id: 'candidate' },
      { op: 'delete', clip, id: 'original' },
      { op: 'delete', clip, id: 'missing' },
      { op: 'delete', clip: { ...clip, currentAssetId: 'asset-original', activeTakeId: 'original', versions: [original, { ...candidate, assetId: 'asset-original' }] }, id: 'original' },
      { op: 'delete', clip: { ...clip, currentAssetId: 'asset-original', activeTakeId: 'original', versions: [original, { ...candidate, assetId: 'asset-original' }] }, id: 'candidate' },
      { op: 'delete', clip: { ...clip, currentAssetId: 'unknown', activeTakeId: 'candidate' }, id: 'candidate' }
    ];
    const binary = process.env.NT_AI_TAKE_ORACLE;
    if (!binary) throw new Error('NT_AI_TAKE_ORACLE is required');
    const actual = JSON.parse(execFileSync(binary, [JSON.stringify(requests)], { encoding: 'utf8', timeout: 10000 })) as Array<{ clip: unknown; failed: boolean }>;
    const outOfBounds = { ...clip, versions: [original, { ...candidate,
      sourceMapping: { inPointMs: 1000, outPointMs: 9000, speedMultiplier: 2 } }] };
    const bounded = JSON.parse(execFileSync(binary, [JSON.stringify([{ op: 'apply', clip: outOfBounds, id: 'candidate' }])],
      { encoding: 'utf8', timeout: 10000 })) as Array<{ clip: unknown; failed: boolean }>;
    expect(bounded).toEqual([{ clip: outOfBounds, failed: true }]);
    // Native validates the effective source window. The web's timeline-length
    // check rejects this valid slowed baseline even though its source fits.
    const slowed = { ...clip, durationMs: 8000, inPointMs: 0, outPointMs: 8000,
      speedMultiplier: 1, speedBaked: true, versions: [{ ...original, durationMs: 4000,
        sourceMapping: { inPointMs: 0, outPointMs: 4000, speedMultiplier: 0.5 } }] };
    const slowResult = JSON.parse(execFileSync(binary, [JSON.stringify([{ op: 'apply', clip: slowed, id: 'original' }])],
      { encoding: 'utf8', timeout: 10000 })) as Array<{ clip: typeof slowed; failed: boolean }>;
    expect(slowResult[0]!.failed).toBe(false);
    expect(slowResult[0]!.clip.outPointMs).toBe(4000);
    expect(slowResult[0]!.clip.speedMultiplier).toBe(0.5);
    expect(applyTakeToClip(slowed, 'original').error).toBeTruthy();
    // When two versions share an asset, web chooses the first matching asset
    // even if the stored active ID names the second. Native preserves that
    // explicit valid selection so deletion cannot remove the selected take.
    const shared = { ...clip, currentAssetId: 'asset-original', activeTakeId: 'candidate',
      versions: [original, { ...candidate, assetId: 'asset-original' }] };
    const sharedResult = JSON.parse(execFileSync(binary, [JSON.stringify([
      { op: 'delete', clip: shared, id: 'candidate' },
      { op: 'delete', clip: shared, id: 'original' }
    ])], { encoding: 'utf8', timeout: 10000 })) as Array<{ clip: unknown; failed: boolean }>;
    expect(sharedResult[0]!.failed).toBe(true);
    expect(sharedResult[1]!.failed).toBe(false);
    expect(deleteTake(shared, 'candidate').error).toBeFalsy();
    expect(deleteTake(shared, 'original').error).toBeTruthy();
    expect(actual).toHaveLength(requests.length);
    requests.forEach((request, index) => {
      const input = request.clip as typeof clip;
      if (request.op === 'rename') {
        expect(actual[index]!.clip, `case ${index}`).toEqual(renameTake(input, request.id, request.label ?? ''));
      } else {
        const expected = request.op === 'apply' ? applyTakeToClip(input, request.id) : deleteTake(input, request.id);
        expect(actual[index]!.clip, `case ${index}`).toEqual(expected.clip);
        expect(actual[index]!.failed, `case ${index}`).toBe(Boolean(expected.error));
      }
    });
  });
});
