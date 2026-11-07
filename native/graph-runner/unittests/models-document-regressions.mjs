import { createGuestModels } from '../guest/host/models.mjs';

/** Native-only DB invariants, including scoped prefix behavior beyond the TS DAL. */
export async function documentRegressions(models, options) {
  const { repository: repository, interfaces: api } = models;
  const peer = createGuestModels({ ...options, userId: 'alice' });
  let checks = 0;
  const check = (value, label) => { checks++; if (!value) throw new Error(`document regression: ${label}`); };
  const call = (name, args) => api[name]({ ...args, userId: 'alice' });
  const pc = (name, args) => peer.interfaces[name]({ ...args, userId: 'alice' });
  try {
    check(Object.keys(api).length === 24, 'all 24 ports implemented for granted SQLite and asset storage');
    const doc = { cast: [], sections: [] };
    const script = await call('createScript', { document: doc });
    const board = await call('createStoryboard', { document: { shots: [] } });
    const sketch = await call('createImageDocument', { name: 'native', width: 2, height: 2, document: { sketch: {}, layerBindings: [] } });
    const timeline = await call('createTimelineSequence', { sequence: { id: 'aaaaaaaaaaaa11111111111111111111', projectId: 'default', name: 'native', tracks: [], clips: [], markers: [] } });
    for (const [kind, row] of [['storyboards', board], ['images', sketch], ['timelines', timeline]]) {
      check(repository.get(kind, row.id).revision === 1, `${kind} create revision`);
    }
    const peerScript = await pc('updateScript', { id: script.id, document: doc, baseUpdatedAt: script.updatedAt });
    check(peerScript.updatedAt > script.updatedAt, 'second connection updates script');
    check(await call('updateScript', { id: script.id, timelineId: 'stale', baseUpdatedAt: script.updatedAt }) === null, 'cross-connection script CAS misses');
    const peerBoard = await pc('updateStoryboard', { id: board.id, document: { shots: [] }, baseUpdatedAt: board.updatedAt });
    check(await call('updateStoryboard', { id: board.id, timelineId: 'stale', baseUpdatedAt: board.updatedAt }) === null, 'cross-connection board CAS misses');
    check(repository.get('storyboards', board.id).revision === 2, 'board CAS increments revision exactly once');
    const shortBoard = await call('updateStoryboard', { id: board.id.slice(0, 12), timelineId: 'short-link', baseUpdatedAt: peerBoard.updatedAt });
    check(shortBoard.id === board.id && shortBoard.timelineId === 'short-link', 'board short-ID CAS resolves full row');
    const shortScript = await call('updateScript', { id: script.id.slice(0, 12), timelineId: 'short-link', baseUpdatedAt: peerScript.updatedAt });
    check(shortScript.id === script.id && shortScript.timelineId === 'short-link', 'script short-ID CAS resolves full row');
    repository.put('timelines', { ...repository.get('timelines', timeline.id), document: JSON.stringify({ tracks: [], clips: [], markers: [], id: 'injected', name: 'injected', arbitrary: true }) });
    const legacyTimeline = await call('getTimelineSequence', { id: timeline.id });
    check(legacyTimeline.id === timeline.id && legacyTimeline.name === 'native' && !('arbitrary' in legacyTimeline), 'legacy timeline JSON cannot override scalar identity or leak unknown fields');
    // Restore the expected timestamp for the subsequent short-ID CAS test.
    repository.put('timelines', { ...repository.get('timelines', timeline.id), document: JSON.stringify({ tracks: [], clips: [], markers: [] }) }, { updatedAt: timeline.updatedAt });
    check((await call('getTimelineSequence', { id: timeline.id.slice(0, 12) })).id === timeline.id, 'timeline read resolves exact 12-character prefix');
    const shortTimeline = await call('updateTimelineSequence', { id: timeline.id.slice(0, 12), sequence: { ...timeline, name: 'short-changed' } });
    check(shortTimeline.id === timeline.id && shortTimeline.name === 'short-changed', 'timeline short-ID CAS resolves full row');
    check(repository.get('timelines', timeline.id).revision === 2, 'timeline CAS increments revision');
    check(await call('updateTimelineSequence', { id: timeline.id, sequence: timeline }) === null, 'timeline stale revision rejected');
    check(repository.get('timelines', timeline.id).revision === 2, 'failed CAS does not increment revision');
    // Ambiguity is scoped before resolving, independently for every document table.
    for (const [kind, row, method] of [['scripts', script, 'getScript'], ['storyboards', board, 'getStoryboard'],
      ['images', sketch, 'getImageDocument'], ['timelines', timeline, 'getTimelineSequence']]) {
      for (const suffix of ['1'.repeat(20), '2'.repeat(20)]) repository.put(kind, { ...repository.get(kind, row.id), id: 'abcdefabcdef' + suffix });
      let ambiguous = false;
      try { await call(method, { id: 'abcdefabcdef' }); } catch (error) { ambiguous = /ambiguous/.test(error.message); }
      check(ambiguous, `${kind} ambiguous ID fails`);
      check(await call(method, { id: 'abcdefabcde' }) === null, `${kind} 11 characters are not a prefix`);
    }
    // Find recast must query the document keys, rather than scan the latest list window.
    const target = await call('createStoryboard', { document: { shots: [], templateId: 'old-template', recastKey: 'old-key' } });
    for (let i = 0; i < 55; i++) await call('createStoryboard', { name: `later-${i}`, document: { shots: [] } });
    check(!(await call('listStoryboards', {})).some((row) => row.id === target.id), 'old recast is outside default list window');
    check((await call('findRecastStoryboard', { templateId: 'old-template', recastKey: 'old-key' })).id === target.id, 'old recast still found');
    check((await call('listStoryboards', { limit: 0 })).length === 0, 'storyboard zero limit');
    // Domain writes preserve SQLite rollback, not merely in-memory restoration.
    try {
      repository.transaction((tx) => { tx.put('scripts', { id: 'rollback-doc', name: 'rollback', project_id: 'default', document: JSON.stringify(doc) }); throw new Error('rollback'); });
    } catch (error) { check(error.message === 'rollback', 'document transaction raised'); }
    check(await call('getScript', { id: 'rollback-doc' }) === null, 'document transaction rolled back');
    const defaults = await call('createImageDocument', { name: 'defaults' });
    check(defaults.width === 1024 && defaults.document.sketch.layers[0].name === 'Layer 1', 'production sketch constructor default');
    check((await call('createScript', {})).document.sections.length === 0, 'production script default document');
    check((await call('createStoryboard', {})).document.aspectRatio === '16:9', 'production board default document');
    return checks;
  } finally { peer.close(); }
}
