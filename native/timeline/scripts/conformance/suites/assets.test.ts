import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assetToClip } from '../../../../../web/src/components/timeline/dnd/assetToClipAdapter';
import { snapAssetDropMs } from '../../../../../web/src/components/timeline/Tracks/dropSnap';
import { makeClip } from '@nodetool-ai/timeline';
import type { Asset } from '../../../../../web/src/stores/ApiTypes';

describe('assetToClip against the web adapter', () => {
  const cases = [
    { content_type: 'image/png', name: 'still.png' },
    { content_type: 'video/mp4', name: 'take.mp4', duration: 1.2345 },
    { content_type: 'video/mp4', name: 'unknown.mp4' },
    { content_type: 'audio/wav', name: 'voice.wav', duration: 0 },
    { content_type: 'audio/mpeg', name: 'music.mp3', duration: 8.75 },
    { content_type: 'application/octet-stream', name: 'SCENE.GLB', duration: 99 },
    { content_type: 'model/gltf+json', name: 'scene', duration: null },
    { content_type: 'video/mp4', name: 'poster.mp4', metadata: { thumbnails: ['poster-id', 'other-id'] } },
    { content_type: 'video/mp4', name: 'empty.mp4', metadata: { thumbnails: [] } },
    { content_type: 'text/plain', name: 'notes.txt' }
  ];
  it('matches every clip field, normalizing only the generated id', () => {
    const requests = cases.map((fields, index) => ({
      asset: { id: '0123456789abcdef0123456789abcdef', duration: null, metadata: null, ...fields },
      trackId: `track-${index}`, startMs: index * 123.5
    }));
    const binary = process.env.NT_ASSETS_ORACLE;
    if (!binary) { throw new Error('NT_ASSETS_ORACLE is required'); }
    const actual: Array<Record<string, unknown> | null> = JSON.parse(execFileSync(binary, [JSON.stringify(requests)], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }
    }));
    const expected = requests.map(request => {
      try {
        // Asset's persistence fields are irrelevant to this adapter.
        const asset = request.asset as unknown as Asset;
        return { ...assetToClip(asset, request.trackId, request.startMs), id: '<generated>' };
      } catch { return null; }
    });
    for (const clip of actual) {
      if (clip) { expect(clip.id).toMatch(/^[a-f0-9]{32}$/); }
    }
    expect(actual.map(clip => clip && { ...clip, id: '<generated>' })).toEqual(expected);
  });
  it('snaps lane drops like the web across clip halves and nearby gaps', () => {
    const clips = [makeClip({ id: 'first', trackId: 'v', startMs: 100, durationMs: 1000 }),
      makeClip({ id: 'second', trackId: 'v', startMs: 2000, durationMs: 500 }),
      makeClip({ id: 'other', trackId: 'a', startMs: 0, durationMs: 5000 })];
    const requests = [-100, 0, 100, 101, 599, 600, 1099, 1100, 1124, 1125, 1600, 2001, 2499, 2500, 2600].flatMap(atMs =>
      [0, 24, 500].map(snapMs => ({ op: 'snap', clips, trackId: 'v', atMs, snapMs })));
    const binary = process.env.NT_ASSETS_ORACLE;
    if (!binary) { throw new Error('NT_ASSETS_ORACLE is required'); }
    const actual: unknown = JSON.parse(execFileSync(binary, [JSON.stringify(requests)], { encoding: 'utf8', timeout: 10000 }));
    expect(actual).toEqual(requests.map(request => snapAssetDropMs(clips, request.trackId, request.atMs, request.snapMs)));
  });
});
