import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { applyTakeToClip, deleteTake, makeClip, makeClipVersion, renameTake } from '@nodetool-ai/timeline';

const original = makeClipVersion({ createdAt: '2020-01-01T00:00:00.000Z', workflowUpdatedAt: '2020-01-01T00:00:00.000Z', id: 'original', assetId: 'asset-original', status: 'success',
  durationMs: 4000, dependencyHash: 'base', paramOverridesSnapshot: { seed: 1 } });
const candidate = makeClipVersion({ createdAt: '2020-01-02T00:00:00.000Z', workflowUpdatedAt: '2020-01-02T00:00:00.000Z', id: 'candidate', assetId: 'asset-new', status: 'success',
  durationMs: 5000, dependencyHash: 'new', paramOverridesSnapshot: { seed: 2 } });
const clip = makeClip({ id: 'clip', name: 'Clip', mediaType: 'video', durationMs: 4000,
  currentAssetId: 'asset-original', activeTakeId: 'candidate', dependencyHash: 'base',
  inPointMs: 200, outPointMs: 4200, versions: [original, candidate] });

describe('native take operations against timeline rules', () => {
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
