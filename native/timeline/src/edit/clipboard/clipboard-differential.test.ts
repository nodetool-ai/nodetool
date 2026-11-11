import { describe, expect, it } from 'vitest';
import { makeClip, makeTrack, findGap } from '@nodetool-ai/timeline';
import { copyClipsToClipboard, hasClipboardClips, firstClipboardClip, buildPastedClips, cloneClips, cloneClipsToTrack } from '../../../../../web/src/stores/timeline/clipboardOps.ts';
import { attributeGroupApplies, attributePatch, PASTE_ATTRIBUTE_GROUPS } from '../../../../../web/src/stores/timeline/pasteAttributes.ts';
import { createTimelineStore, lockedUserTargetIds, targetedTrackIds } from '../../../../../web/src/stores/timeline/TimelineStore.ts';
import { groupDescendantIds, isGroupClip } from '@nodetool-ai/timeline';
import { edit, equalClips, native } from './oracle.ts';

const tracks = [makeTrack({ id: 'v', type: 'video', index: 3 }), makeTrack({ id: 'a', type: 'audio', index: 0 }), makeTrack({ id: 'o', type: 'overlay', index: 1 })];
function clips() {
  return [
    makeClip({ id: 'g', trackId: 'v', mediaType: 'group', startMs: 100, durationMs: 1900 }),
    makeClip({ id: 'v1', trackId: 'v', parentId: 'g', startMs: 200, durationMs: 800, linkId: 'L', transform: { x: 2 }, extra: { saved: true } } as any),
    makeClip({ id: 'a1', trackId: 'a', mediaType: 'audio', startMs: 300, durationMs: 800, linkId: 'L' }),
    makeClip({ id: 'v2', trackId: 'o', parentId: 'external', startMs: 1300, durationMs: 700, linkId: 'single' })
  ];
}
function store(doc: any) {
  const s = createTimelineStore();
  s.setState({ ...doc, untargetedTrackIds: new Set(doc.untargetedTrackIds ?? []), syncLockOffTrackIds: new Set(doc.syncLockOffTrackIds ?? []) });
  return s;
}
function copied(doc: any, selected: string[], cut: boolean) {
  const ids = new Set(selected);
  for (const c of doc.clips) if (ids.has(c.id) && isGroupClip(c)) for (const id of groupDescendantIds(doc.clips, c.id)) ids.add(id);
  const locked = cut ? lockedUserTargetIds(doc.clips, doc.tracks) : new Set();
  return doc.clips.filter((c: any) => ids.has(c.id) && !locked.has(c.id));
}

describe('F clipboard pure oracle', () => {
  it('copy snapshots a module buffer, exposes the first clip and pastes with track fallback and fresh ids', () => {
    const source = clips();
    for (const target of [undefined, [], ['a'], ['o', 'a'], ['v', 'a']]) {
      for (const atMs of [-300, 0, 1234.5]) {
        const ts = tracks.map(t => ({ ...t, locked: t.id === 'v' }));
        copyClipsToClipboard(source);
        const expected = buildPastedClips(ts, atMs, target === undefined ? undefined : new Set(target));
        const result = native('clipboardRoundTrip', [source, ts, atMs, target]);
        expect(result.count).toBe(source.length);
        expect(result.has).toBe(hasClipboardClips());
        expect(result.first).toEqual(firstClipboardClip());
        equalClips(result.clips, expected, source);
        expect(result.emptyAfterClear).toBe(true);
      }
    }
  });
  it('cloneClips and cloneClipsToTrack remap parents, detach external parents and preserve only complete links', () => {
    for (const source of [[], clips(), clips().slice(1), clips().slice(1, 2)]) {
      equalClips(native('cloneClips', [source]), cloneClips(source), source);
      equalClips(native('cloneClipsToTrack', [source, 'dest']), cloneClipsToTrack(source, 'dest'), source);
    }
  });
  it('paste rounding preserves relative offsets before adding the anchor', () => {
    const source = [makeClip({ id: 'distant', trackId: 'v', startMs: 1_000_000_000, durationMs: 100 })];
    copyClipsToClipboard(source);
    for (const atMs of [1234.499999999, 0.49999999999999994]) {
      equalClips(native('clipboardRoundTrip', [source, tracks, atMs]).clips, buildPastedClips(tracks, atMs), source);
    }
  });
  it('copy and cut with no selection keep the previous clipboard', () => {
    const doc = { clips: clips(), tracks };
    for (const action of ['copy', 'cut']) expect(native('emptySelectionCopy', [doc, action])).toEqual(doc.clips[1]);
  });
  it('attribute applicability and every field group match, including cleared source fields', () => {
    const source = makeClip({ id: 'source', opacity: 0.3, volumeDb: -6, effects: [{ id: 'effect', type: 'blur' }] } as any);
    for (const mediaType of ['video', 'audio', 'midi', 'image', 'text', 'shape', 'group', 'adjustment'] as const) {
      const target = makeClip({ mediaType, blendMode: 'multiply', crop: { left: 0.1 }, audioEffects: [] } as any);
      for (const group of PASTE_ATTRIBUTE_GROUPS) {
        expect(native('attributeGroupApplies', [group, target])).toBe(attributeGroupApplies(group, target));
        // JSON omits undefined. The cleared fields are also checked through the store action below.
        expect(native('attributePatch', [source, target, [group]])).toEqual(JSON.parse(JSON.stringify(attributePatch(source, target, new Set([group])))));
      }
    }
  });
});

describe('F clipboard store differential', () => {
  for (const action of ['copy', 'cut', 'paste', 'pasteInsert', 'duplicateSelected', 'duplicateWithGap', 'altDragCopy', 'pasteClipAttributes', 'closeGapAt']) {
    it(`${action} matches the web action`, () => {
      for (let i = 0; i < 20; i++) {
        const cs = clips();
        cs.push(makeClip({ id: 'external', trackId: 'o', mediaType: 'group', startMs: 1300, durationMs: 700 }));
        cs.push(makeClip({ id: 'tail', trackId: 'v', startMs: 4000, durationMs: 500 }));
        cs[1].locked = i % 5 === 0;
        cs[1].opacity = 0.7;
        cs[1].crop = { left: 0.2 } as any;
        const doc = { clips: cs, tracks: tracks.map(t => ({ ...t, locked: i % 7 === 0 && t.id === 'a' })), linkedSelection: i % 3 !== 0, untargetedTrackIds: i % 4 === 0 ? ['v'] : [], syncLockOffTrackIds: i % 6 === 0 ? ['o'] : [] };
        const s = store(doc);
        const ids = i % 2 ? ['g', 'a1'] : ['v1', 'v2'];
        const p: any = { mode: ['overlap', 'overwrite', 'insert'][i % 3], selectedIds: ids, linked: doc.linkedSelection, atMs: 2000 + i * 10, deltaMs: 300, clipId: 'v1', groups: [...PASTE_ATTRIBUTE_GROUPS].filter(g => g !== 'speed') };
        let expected = cs;
        if (action === 'copy' || action === 'cut') {
          const source = copied(doc, ids, action === 'cut');
          const result = native('copyAction', [doc, action, p]);
          expect(result.first).toEqual(source[0] ?? null);
          expect(result.count).toBe(source.length);
          if (action === 'cut') s.getState().deleteSelected(new Set(ids));
          equalClips(result.doc.clips, s.getState().clips, doc);
          continue;
        }
        if (action === 'paste' || action === 'pasteInsert') {
          p.clipboard = copied(doc, ids, false);
          copyClipsToClipboard(p.clipboard);
          const pasted = buildPastedClips(doc.tracks, p.atMs, targetedTrackIds(s.getState()));
          s.getState().addClips(pasted);
          s.getState().resolveDrop(new Set(pasted.map(c => c.id)), action === 'pasteInsert' ? 'insert' : p.mode);
        } else if (action === 'duplicateSelected' || action === 'duplicateWithGap') {
          p.offsetMs = i * 7;
          s.getState().duplicateSelected(new Set(ids), action === 'duplicateWithGap' ? 1000 : p.offsetMs);
        } else if (action === 'altDragCopy' && !cs[1].locked) {
          let roots = new Set(ids.includes(p.clipId) && ids.length > 1 ? ids : [p.clipId]);
          for (const c of cs) if (roots.has(c.id) && isGroupClip(c)) for (const id of groupDescendantIds(cs, c.id)) roots.add(id);
          if (doc.linkedSelection) {
            const links = new Set(cs.filter(c => roots.has(c.id) && c.linkId !== undefined).map(c => c.linkId));
            for (const c of cs) if (c.linkId !== undefined && links.has(c.linkId)) roots.add(c.id);
          }
          s.getState().addClips(cloneClips(cs.filter(c => roots.has(c.id))));
          if (ids.includes(p.clipId) && ids.length > 1) s.getState().moveSelectedClips(p.clipId, new Set(ids), p.deltaMs);
          else s.getState().moveClip(p.clipId, p.deltaMs);
          s.getState().resolveDrop(new Set(ids.includes(p.clipId) && ids.length > 1 ? ids : [p.clipId]), p.mode);
        } else if (action === 'altDragCopy') {
          // useClipDrag refuses a locked primary before leaving copies behind.
        } else if (action === 'pasteClipAttributes') {
          p.source = makeClip({ id: 'source', opacity: 0.3, transform: { x: 5 }, volumeDb: -4 } as any);
          s.getState().pasteClipAttributes(new Set(ids), p.source, new Set(p.groups));
        } else {
          p.trackId = 'v'; p.timeMs = 3000;
          s.getState().closeGapAt(p.trackId, p.timeMs);
        }
        expected = s.getState().clips;
        // Seed the native module-level buffer through a copy call, as the keyboard path does.
        equalClips(native('seededEdit', [doc, action, p]), expected, { doc, source: p.source, clipboard: p.clipboard });
      }
    });
  }
  it('gap selection bounds match findGap before, within and after occupied spans', () => {
    const cs = clips();
    for (const time of [-1, 0, 99, 100, 500, 2000, 2100, 9000]) expect(native('findGap', [cs, 'v', time])).toEqual(findGap(cs, 'v', time));
  });
  it('marquee uses strict time overlap, inclusive lane bounds, and Shift union in selection order', () => {
    const cs = clips();
    const rows = [{ trackId: 'v', top: 0, bottom: 64 }, { trackId: 'a', top: 64, bottom: 64 }, { trackId: 'o', top: 64, bottom: 128 }];
    for (const [startMs, endMs, top, bottom] of [[200, 1300, 64, 64], [1000, 1300, 0, 128], [0, 2000, -20, -1], [0, 2000, 0, 128]]) {
      const hit = cs.filter(c => { const row = rows.find(r => r.trackId === c.trackId); return row && row.top <= bottom && row.bottom >= top && c.startMs + c.durationMs > startMs && c.startMs < endMs; }).map(c => c.id);
      for (const base of [[], ['v2', 'g']]) expect(native('marquee', [cs, rows, { startMs, endMs, top, bottom }, base])).toEqual([...new Set([...base, ...hit])]);
    }
  });
});
