import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { hasCrop, isCropUsable, cropRectPx, sampleReframeAt, resolveReframeCrop,
  addReframeKeyframe, clearReframe, isReframeStale, renderableReframe, mediaTrackCanDriveReframe,
  type ClipCrop, type ClipReframe, type TimelineClip, type MediaTrack } from '@nodetool-ai/timeline';
import { createTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore';
import { sourcePointToReframeViewport, reframeViewportPointToSource } from '../../../../../web/src/components/timeline/preview/ReframeFocusOverlay';

type Request = Record<string, unknown>;
function native(requests: Request[]): unknown[] {
  const bin = process.env.NT_REFRAME_BINARY;
  if (!bin) throw new Error('NT_REFRAME_BINARY is required');
  // QFile stdin reads in this environment require a finite file rather than
  // the socket that spawnSync supplies. The protocol remains one JSON array.
  const directory = mkdtempSync(path.join(tmpdir(), 'reframe-oracle-'));
  const input = path.join(directory, 'input.json');
  writeFileSync(input, JSON.stringify(requests));
  const fd = openSync(input, 'r');
  try {
    return JSON.parse(execFileSync(bin, ['--oracle'], { stdio: [fd, 'pipe', 'pipe'], encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, timeout: 20000,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' } }));
  } finally {
    closeSync(fd);
    rmSync(directory, { recursive: true, force: true });
  }
}
const clip: TimelineClip = { id: 'c', trackId: 'v', name: 'Clip', mediaType: 'video', startMs: 100,
  durationMs: 1000, sourceType: 'imported', status: 'generated', versions: [], currentAssetId: 'asset' };
const tracks = [{ id: 'v', name: 'Video', type: 'video' as const, index: 0, visible: true, muted: false, locked: false }];
function compare(requests: Request[], expected: unknown[]): void {
  expect(native(requests)).toEqual(JSON.parse(JSON.stringify(expected.map(v => v ?? null))));
}
it('crop math matches the package for absent, noisy, degenerate and rounded crops', () => {
  const crops: (ClipCrop | undefined)[] = [undefined, { left: 0, right: 0, top: 0, bottom: 0 },
    ...[-1, 0.00001, 0.0001, 0.00011, .1, .49995, .5, .95, 1].map(left => ({ left, right: left, top: .01, bottom: .05 }))];
  const requests: Request[] = [], expected: unknown[] = [];
  for (const crop of crops) {
    requests.push({ op: 'hasCrop', crop }, { op: 'isCropUsable', crop });
    expected.push(hasCrop(crop), isCropUsable(crop));
    for (const [width, height] of [[0, 0], [-2, 5], [1, 1], [101, 99], [1920, 1080]]) {
      requests.push({ op: 'cropRectPx', crop, width, height }); expected.push(cropRectPx(crop, width, height));
    }
  }
  compare(requests, expected);
});
it('source-time reframe math, safe margins, smoothing and stale tracks match the package', () => {
  const track: MediaTrack = { id: 'subject', clipId: 'c', name: 'Subject', kind: 'box', status: 'ready',
    sourceAssetId: 'asset', sourceStartMs: 0, sourceEndMs: 1000,
    samples: [{ sourceMs: 0, x: .1, y: .3, width: .2 }, { sourceMs: 500, x: .8, y: .7, width: .4, height: .3 }, { sourceMs: 1000, x: .4, y: .2, height: .2 }] };
  const requests: Request[] = [], expected: unknown[] = [];
  const keys = [{ sourceMs: 700, x: .9, y: .8, zoom: 3 }, { sourceMs: 100, x: .2, y: .3, zoom: .2 }];
  for (const mode of ['auto', 'center', 'track'] as const) for (const smoothing of [0, .7, 1, 2]) {
    const reframe: ClipReframe = { mode, trackId: 'subject', smoothing, samples: [
      { sourceMs: 1000, x: .8, y: .9, width: .4, height: .2 }, { sourceMs: 0, x: .2, y: .1, width: .2, height: .3 }], keyframes: keys, safeMargin: .1 };
    for (const sourceMs of [-10, 0, 50, 100, 300, 500, 700, 1000, 2000]) {
      requests.push({ op: 'sampleReframeAt', reframe, sourceMs, track }); expected.push(sampleReframeAt(reframe, sourceMs, track));
      for (const safeMargin of [-1, 0, .2, .49, 2]) for (const size of [{width: 1920, height: 1080}, {width: 500, height: 1000}, {width: 0, height: 1}]) {
        const framing = { ...reframe, safeMargin };
        const targetSize = { width: 1080, height: 1920 };
        requests.push({ op: 'resolveReframeCrop', reframe: framing, sourceMs, sourceSize: size, targetSize, track });
        expected.push(resolveReframeCrop(framing, sourceMs, size, targetSize, track));
      }
    }
    const keyframe = { sourceMs: 100, x: .7, y: .2 };
    requests.push({ op: 'addReframeKeyframe', reframe, keyframe }); expected.push(addReframeKeyframe(reframe, keyframe));
  }
  for (const sourceAssetId of ['asset', 'old']) for (const status of ['ready', 'generating', 'failed'] as const) for (const mode of ['track', 'center', 'auto'] as const) {
    const reframe: ClipReframe = { mode, sourceAssetId, trackId: 'subject', keyframes: keys };
    for (const currentTrack of [undefined, { ...track, sourceAssetId, status }, { ...track, samples: [] }]) {
      const current = { ...clip, reframe };
      requests.push({op:'isReframeStale',clip:current,track:currentTrack},{op:'renderableReframe',clip:current,track:currentTrack},{op:'clearReframe',clip:current});
      expected.push(isReframeStale(current,currentTrack), renderableReframe(current,currentTrack), clearReframe(current));
      if (currentTrack) { requests.push({op:'mediaTrackCanDriveReframe',track:currentTrack}); expected.push(mediaTrackCanDriveReframe(currentTrack)); }
    }
  }
  const actual = native(requests);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    // Matrix and interpolated math is compared numerically below, JSON fields must agree.
    const compareNumbers = (a: unknown, b: unknown): void => {
      if (typeof a === 'number' && typeof b === 'number') { expect(a, JSON.stringify(requests[i])).toBeCloseTo(b, 10); return; }
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
        for (const key of Object.keys(a)) compareNumbers(Reflect.get(a, key), Reflect.get(b, key));
      } else expect(a).toEqual(b ?? null);
    };
    compareNumbers(value, JSON.parse(JSON.stringify(expected[i] ?? null)));
  });
});
it('named reframe edits match the actual web store actions and preserve other metadata', () => {
  const store = createTimelineStore();
  store.setState({ clips: [structuredClone(clip)], tracks });
  const requests: Request[] = [], expected: unknown[] = [];
  function action(op: string, payload: Request, apply: () => void): void {
    const doc = { clips: structuredClone(store.getState().clips), tracks };
    apply(); requests.push({ op: 'edit', doc, action: op, payload: { clipId: 'c', ...payload } });
    expected.push({ ...doc, clips: JSON.parse(JSON.stringify(store.getState().clips)) });
  }
  for (const mode of ['track', 'center', 'auto'] as const) {
    action('setClipReframeSubject', { mode, trackId: 'subject' }, () => store.getState().setClipReframeSubject('c', mode, 'subject'));
    for (const sourceMs of [500, 100, 500]) action('addClipReframeKeyframe', { sourceMs, x: .3, y: .8, zoom: 2 }, () => store.getState().addClipReframeKeyframe('c', sourceMs, .3, .8, 2));
  }
  action('clearClipReframe', {}, () => store.getState().clearClipReframe('c'));
  action('clearClipReframe', {}, () => store.getState().clearClipReframe('c'));
  compare(requests, expected);
});
it('crop edge edits match the web component patch semantics', () => {
  const requests: Request[] = [], expected: unknown[] = [];
  for (const edge of ['left','right','top','bottom']) for (const value of [-1, 0, .00001, .2, .95, 1]) {
    const crop = { left: 0, right: 0, top: 0, bottom: 0, [edge]: value };
    const current = { ...clip, crop: isCropUsable(crop) && hasCrop(crop) ? crop : undefined };
    requests.push({ op:'edit', doc:{clips:[clip],tracks}, action:'setClipCropEdge', payload:{clipId:'c',edge,value} });
    expected.push({clips:[current],tracks});
  }
  compare(requests, expected);
});
it('focus geometry matches the exported web functions with cropped, transformed and parented layers', () => {
  const requests: Request[] = [], expected: {x:number;y:number}[] = [];
  for (const rotation of [0, .3, -1]) for (const parentMatrix of [undefined, new Float32Array([.8,.1,0,0, -.2,1.2,0,0, 0,0,1,0, .1,-.3,0,1])]) {
    const geometry = { crop:{left:.1,right:.2,top:.05,bottom:.1}, sourceWidth:1920,sourceHeight:1080,
      sequenceWidth:1080,sequenceHeight:1920,frameWidth:405,frameHeight:720,
      transform:{position:{x:30,y:-60},scale:{x:1.2,y:.8},rotation,anchor:{x:.3,y:.7}}, parentMatrix };
    for (const [x,y] of [[0,0],[.2,.8],[.5,.5],[1,1]]) {
      const point = sourcePointToReframeViewport(x,y,geometry);
      const jsonGeometry = {...geometry,parentMatrix:parentMatrix ? Array.from(parentMatrix) : undefined};
      requests.push({op:'sourcePointToReframeViewport',x,y,geometry:jsonGeometry}); expected.push(point);
      requests.push({op:'reframeViewportPointToSource',x:point.x,y:point.y,geometry:jsonGeometry}); expected.push(reframeViewportPointToSource(point.x,point.y,geometry));
    }
  }
  native(requests).forEach((value,i) => {
    expect(value).toEqual({x:expect.any(Number),y:expect.any(Number)});
    expect(Reflect.get(Object(value),'x')).toBeCloseTo(expected[i].x, 3);
    expect(Reflect.get(Object(value),'y')).toBeCloseTo(expected[i].y, 3);
  });
});
