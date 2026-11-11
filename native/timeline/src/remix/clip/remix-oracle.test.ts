import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { applyTakeToClip, deleteTake } from '@nodetool-ai/timeline';
import { timelineClip, clipVersion } from '../../../../../packages/protocol/src/api-schemas/timeline.ts';

const binary = process.env.NT_REMIX_ORACLE;
if (!binary) throw new Error('NT_REMIX_ORACLE is required');

const run = (requests: unknown[]) =>
  JSON.parse(execFileSync(binary, [JSON.stringify(requests)], { encoding: 'utf8', timeout: 10000 })) as Array<{ raw: any; changed: boolean }>;

const generated = {
  id: 'gen', createdAt: '2026-01-01T00:00:00.000Z', jobId: 'job', assetId: 'asset-src', workflowUpdatedAt: '2026-01-01T00:00:00.000Z',
  dependencyHash: 'h', paramOverridesSnapshot: { prompt: 'upbeat' }, status: 'success', durationMs: 40000, source: 'generated'
};
const music = (extra: Record<string, unknown> = {}) => ({
  id: 'music', trackId: 'a1', name: 'Theme', mediaType: 'audio', startMs: 2000, durationMs: 40000, currentAssetId: 'asset-src',
  status: 'generated', sourceType: 'generated', locked: false, dependencyHash: 'h', paramOverrides: { prompt: 'upbeat' }, versions: [], ...extra
});
const doc = (clip: Record<string, unknown>) => ({
  id: 'doc', fps: 30, durationMs: 120000, tracks: [{ id: 'a1', name: 'Music', type: 'audio', index: 0 }], clips: [clip]
});
const payload = (durationMs: number, takeId = 'take-1', assetId = 'asset-remix') => ({
  clipId: 'music', assetId, takeId, createdAt: '2026-11-02T10:00:00.000Z', durationMs, sourceDurationMs: 40000,
  remix: { targetMs: durationMs, segments: 50, variations: 50, bpm: 120, beats: 80, cuts: [{ outMs: 12000, inMs: 4000 }], tempoChangePercent: 0.4 }
});

describe('native remix edits against the web document rules', () => {
  it('writes takes the web schema keeps field for field', () => {
    const [first, second] = run([
      { op: 'remix', raw: doc(music({ inPointMs: 5000, outPointMs: 45000 })), payload: payload(30000) },
      { op: 'remix', raw: doc(music({ versions: [generated], activeTakeId: 'gen' })), payload: payload(30000) }
    ]);
    for (const { raw, changed } of [first!, second!]) {
      expect(changed).toBe(true);
      const clip = raw.clips[0];
      const parsed = timelineClip.parse(clip);
      // Zod strips unknown keys: nothing the native editor wrote may be lost on the web's save.
      expect(parsed).toEqual(clip);
      for (const version of clip.versions) expect(clipVersion.parse(version)).toEqual(version);
      expect(clip.versions.at(-1).paramOverridesSnapshot.remix.sourceAssetId).toBe('asset-src');
      expect(clip.currentAssetId).toBe('asset-remix');
      expect(clip.durationMs).toBe(30000);
    }
  });

  it('lets the web switch back to the source take and delete the remix take', () => {
    const [{ raw }] = run([{ op: 'remix', raw: doc(music({ inPointMs: 5000, outPointMs: 45000 })), payload: payload(30000) }]);
    const clip = raw.clips[0];
    const baseline = clip.versions[0];
    expect(baseline.assetId).toBe('asset-src');
    const back = applyTakeToClip(clip, baseline.id);
    expect(back.error).toBeFalsy();
    expect(back.clip.currentAssetId).toBe('asset-src');
    expect(back.clip.activeTakeId).toBe(baseline.id);
    // The web restores the window the music played from, not the remix's own.
    expect(back.clip.inPointMs).toBe(5000);
    expect(back.clip.outPointMs).toBe(35000);
    // The clip keeps its generation settings through the take switch.
    expect(back.clip.paramOverrides).toEqual({ prompt: 'upbeat' });
    const forward = applyTakeToClip(back.clip, 'take-1');
    expect(forward.clip.inPointMs).toBe(0);
    expect(forward.clip.outPointMs).toBe(30000);
    expect(forward.clip.paramOverrides.prompt).toBe('upbeat');
    // The remix take can go once the source is the active one.
    expect(deleteTake(back.clip, 'take-1').error).toBeFalsy();
    // The active take cannot be deleted from under the clip.
    expect(deleteTake(clip, 'take-1').error).toBeTruthy();
  });

  it('reverts to the document it started from, and a second remix keeps the first source', () => {
    const start = doc(music({ inPointMs: 5000, outPointMs: 45000 }));
    const [one] = run([{ op: 'remix', raw: start, payload: payload(30000) }]);
    const [two] = run([{ op: 'remix', raw: one!.raw, payload: payload(20000, 'take-2', 'asset-remix-2') }]);
    expect(two!.raw.clips[0].versions).toHaveLength(3);
    expect(two!.raw.clips[0].versions[2].paramOverridesSnapshot.remix.sourceAssetId).toBe('asset-src');
    const [reverted] = run([{ op: 'revert', raw: two!.raw, payload: { clipId: 'music' } }]);
    const clip = { ...reverted!.raw.clips[0] };
    const original = { ...start.clips[0] } as Record<string, unknown>;
    delete clip.versions;
    delete clip.activeTakeId;
    delete original.versions;
    expect(clip).toEqual(original);
    expect(timelineClip.parse(reverted!.raw.clips[0])).toEqual(reverted!.raw.clips[0]);
  });

  it('refuses what would overlap the next clip and leaves the document alone', () => {
    const next = { id: 'next', trackId: 'a1', name: 'Next', mediaType: 'audio', startMs: 50000, durationMs: 5000, currentAssetId: 'asset-next', status: 'generated', sourceType: 'generated', locked: false, versions: [] };
    const raw = { ...doc(music()), clips: [music({ durationMs: 20000 }), next] };
    const [refused, allowed] = run([
      { op: 'remix', raw, payload: payload(60000) },
      { op: 'remix', raw, payload: payload(45000) }
    ]);
    expect(refused!.changed).toBe(false);
    expect(refused!.raw).toEqual(raw);
    expect(allowed!.changed).toBe(true);
  });
});
