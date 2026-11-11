import { describe, expect, it } from 'vitest';
import { makeClip, makeTrack } from '@nodetool-ai/timeline';
import { childSpanMs } from '../../../../../web/src/components/timeline/Tracks/GroupBracket.tsx';
import { createTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore.ts';
import { edit, equalClips, native } from '../clipboard/oracle.ts';

function document(i = 1) {
  return { linkedSelection: i % 3 !== 0, tracks: [makeTrack({ id: 'v', type: 'video' }), makeTrack({ id: 'a', type: 'audio' }), makeTrack({ id: 'o', type: 'overlay' })], clips: [
    makeClip({ id: 'g', mediaType: 'group', trackId: 'o', startMs: 500, durationMs: 4000 }),
    makeClip({ id: 'child', parentId: 'g', trackId: 'v', startMs: 500, durationMs: 2000, inPointMs: 1000, linkId: 'L' }),
    makeClip({ id: 'audio', trackId: 'a', mediaType: 'audio', startMs: 200, durationMs: 2000, inPointMs: 1000, linkId: 'L', locked: i % 9 === 0 }),
    makeClip({ id: 'nested', parentId: 'g', mediaType: 'group', trackId: 'o', startMs: 1000, durationMs: 3000 }),
    makeClip({ id: 'grandchild', parentId: 'nested', trackId: 'v', startMs: 1500, durationMs: 2000, inPointMs: 1000, locked: i % 7 === 0 }),
    makeClip({ id: 'outside', parentId: 'g', trackId: 'v', startMs: 5000, durationMs: 1000 }),
    makeClip({ id: 'tail', trackId: 'v', startMs: 6500, durationMs: 1000 })
  ] };
}
function store(doc: ReturnType<typeof document>) {
  const s = createTimelineStore(); s.setState(structuredClone(doc)); return s;
}
describe('F group store differential through the edit registry', () => {
  for (const action of ['moveClip', 'moveSelectedClips', 'trimClipStart', 'trimClipEnd', 'rippleTrimClipStart', 'rippleTrimClipEnd', 'deleteSelected', 'rippleDeleteSelected', 'nudge', 'groupClips', 'ungroupClips']) {
    it(`${action} accepts group targets and matches the web`, () => {
      let changed = 0;
      for (let i = 1; i <= 36; i++) {
        const doc = document(i); const s = store(doc);
        const deltaMs = [-2000, -400, 300, 800][i % 4];
        const ids = action === 'groupClips' ? ['child', 'audio', 'nested'] : ['g', 'tail'];
        const p: any = { clipId: 'g', selectedIds: ids, deltaMs, linked: doc.linkedSelection };
        if (i % 5 === 0) p.toTrackId = 'v';
        if (i % 6 === 0) doc.tracks[0].locked = true;
        s.setState({ tracks: doc.tracks });
        switch (action) {
          case 'moveClip': s.getState().moveClip(p.clipId, deltaMs, p.toTrackId); break;
          case 'moveSelectedClips': case 'nudge': s.getState().moveSelectedClips(p.clipId, new Set(ids), deltaMs, action === 'nudge' ? undefined : p.toTrackId); break;
          case 'trimClipStart': s.getState().trimClipStart(p.clipId, deltaMs); break;
          case 'trimClipEnd': s.getState().trimClipEnd(p.clipId, deltaMs); break;
          case 'rippleTrimClipStart': s.getState().rippleTrimClipStart(p.clipId, deltaMs); break;
          case 'rippleTrimClipEnd': s.getState().rippleTrimClipEnd(p.clipId, deltaMs); break;
          case 'deleteSelected': s.getState().deleteSelected(new Set(ids)); break;
          case 'rippleDeleteSelected': s.getState().rippleDeleteSelected(new Set(ids)); break;
          case 'groupClips': s.getState().groupClips(new Set(ids)); break;
          case 'ungroupClips': for (const id of ids) if (s.getState().clips.some(c => c.id === id && c.mediaType === 'group')) s.getState().deleteClip(id); break;
        }
        equalClips(edit(doc, action, p).clips, s.getState().clips, doc);
        if (JSON.stringify(s.getState().clips) !== JSON.stringify(doc.clips)) changed++;
      }
      expect(changed).toBeGreaterThan(0);
    });
  }
  it('roll trims a group edge or its group neighbour through the registry', () => {
    for (const id of ['g', 'neighbour']) for (const deltaMs of [-100, 100, 1000]) {
      const doc = document();
      doc.clips.push(makeClip({ id: 'neighbour', trackId: 'o', startMs: 4500, durationMs: 1000, inPointMs: 500 }));
      const s = store(doc);
      const edge = id === 'g' ? 'end' : 'start';
      s.getState().rollClipEdge(id, edge, deltaMs, 10000);
      equalClips(edit(doc, 'rollClipEdge', { clipId: id, edge, deltaMs, maxSourceDurationMs: 10000 }).clips, s.getState().clips, doc);
    }
  });
  it('ordinary targets continue to use builtin behavior', () => {
    const doc = document();
    for (const action of ['moveClip', 'moveSelectedClips', 'trimClipStart', 'trimClipEnd', 'deleteSelected']) {
      const s = store(doc); const ids = new Set(['child']);
      if (action === 'moveClip') s.getState().moveClip('child', 100);
      if (action === 'moveSelectedClips') s.getState().moveSelectedClips('child', ids, 100);
      if (action === 'trimClipStart') s.getState().trimClipStart('child', 100);
      if (action === 'trimClipEnd') s.getState().trimClipEnd('child', 100);
      if (action === 'deleteSelected') s.getState().deleteSelected(ids);
      equalClips(edit(doc, action, { clipId: 'child', selectedIds: [...ids], deltaMs: 100 }).clips, s.getState().clips, doc);
    }
  });
  it('descendant spans match the web bracket including empty and cyclic graphs', () => {
    const cs = document().clips;
    for (const id of ['g', 'nested', 'missing']) expect(native('childSpanMs', [cs, id])).toEqual(childSpanMs(cs, id));
    cs[0].parentId = 'nested';
    expect(native('childSpanMs', [cs, 'g'])).toEqual(childSpanMs(cs, 'g'));
  });
});
