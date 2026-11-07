const { AddClipsToTimelineNode, FillTimelineTextNode, RetargetTimelineNode, TimelineTranscriptNode } = await import('@nodetool-ai/video-nodes/nodes/timeline');
import { makeSequence, makeTrack, makeClip } from '@nodetool-ai/timeline';
import { PNG } from './timeline-process-media.mjs';

export async function timelineProcessFixture(context) {
  let checks = 0;
  const check = (ok, label) => { checks++; if (!ok) throw new Error(`timeline process: ${label}`); };
  const ids = new Map();
  function identity(id, label) {
    check(/^[a-f0-9]{32}$/.test(id), `${label} full ID`);
    ids.set(id, `<${label}>`);
  }
  function documentIds(seq, label) {
    identity(seq.id, label);
    seq.tracks.forEach((track, i) => identity(track.id, `${label}-track-${i}`));
    seq.clips.forEach((clip, i) => identity(clip.id, `${label}-clip-${i}`));
  }
  const asset = await context.createAsset({ name: 'fixture.png', contentType: 'image/png', content: new Uint8Array(PNG) });
  identity(asset.id, 'image');
  let added = null;
  const failures = {};
  try {
  const add = Object.assign(new AddClipsToTimelineNode(), { name: 'Actual process', image_duration_ms: 500,
    timeline: { type: 'timeline', id: null }, clips: [{ type: 'image', asset_id: asset.id }, { type: 'image', data: new Uint8Array(PNG) }] });
  const createdOutput = await add.process(context);
  const created = await context.getTimelineSequence(createdOutput.output.id);
  documentIds(created, 'added');
  check(created.clips.length === 2 && created.durationMs === 1000, 'AddClips creates two real clips');
  check(created.clips[0].startMs === 0 && created.clips[1].startMs === 500, 'clips placed consecutively');
  const stored = await context.getAssetInfo(created.clips[1].currentAssetId);
  identity(stored.id, 'created-image');
  check(stored.content_type === 'image/png', 'inline image persisted with sniffed MIME');
  const resolved = await context.resolveAssetBytes(`asset://${stored.id}`);
  const bytes = resolved?.bytes ?? resolved;
  check(bytes.length === PNG.length && bytes.every((v, i) => v === PNG[i]), 'inline media exact stored bytes');
  add.timeline = createdOutput.output;
  add.clips = [{ type: 'image', asset_id: asset.id }];
  const appendedOutput = await add.process(context);
  const appended = await context.getTimelineSequence(appendedOutput.output.id);
  identity(appended.clips[2].id, 'appended-clip');
  check(appended.id === created.id && appended.durationMs === 1500 && appended.clips[2].startMs === 1000, 'append updates same row at track end');

    added = { createdOutput, created, appendedOutput, appended, stored: { name: stored.name, content_type: stored.content_type }, bytes: Array.from(bytes) };
  } catch (error) { failures.AddClips = { message: error.message, stack: error.stack }; }

  const track = makeTrack({ type: 'video', name: 'Picture', index: 0 });
  const source = await context.createTimelineSequence(makeSequence({ projectId: 'default', name: 'Template', width: 1920, height: 1080,
    durationMs: 1000, tracks: [track], clips: [
      makeClip({ trackId: track.id, mediaType: 'image', name: 'Image', durationMs: 1000, currentAssetId: asset.id,
        caption: { words: [{ word: '{{name}}', startMs: 0, endMs: 500 }, { word: '{{missing}}', startMs: 500, endMs: 1000 }] } }),
      makeClip({ trackId: track.id, mediaType: 'text', name: 'Title', durationMs: 1000,
        textStyle: { text: '{{name}} costs {{price}} {{missing}}', fontSizePx: 48, color: '#ffffff', fontFamily: 'Inter' } })
    ], transcript: [{ id: 'line', text: 'Spoken line', startMs: 0, endMs: 1000 }], markers: [{ id: 'marker', timeMs: 500, label: 'Keep' }] }));
  documentIds(source, 'template');
  const before = JSON.stringify(source);
  const fillOutput = await Object.assign(new FillTimelineTextNode(), { timeline: { type: 'timeline', id: source.id },
    values: { name: 'Ada', price: 12 }, name: 'Filled' }).process(context);
  const filled = await context.getTimelineSequence(fillOutput.timeline.id);
  identity(filled.id, 'filled');
  check(filled.templateId === source.id && filled.id !== source.id, 'fill derives lineage');
  check(filled.clips[1].textStyle.text === 'Ada costs 12 {{missing}}', 'real text replacement');
  check(filled.clips[0].caption.words[0].word === 'Ada', 'real caption replacement');
  check(fillOutput.filled.includes('name') && fillOutput.filled.includes('price') && fillOutput.unresolved.includes('missing'), 'filled/unresolved outputs');
  check(JSON.stringify(await context.getTimelineSequence(source.id)) === before, 'fill leaves source unchanged');
  const retargets = {};
  for (const fit of ['cover', 'contain']) {
    const output = await Object.assign(new RetargetTimelineNode(), { timeline: { type: 'timeline', id: filled.id }, aspect_ratio: '9:16', fit, name: '' }).process(context);
    const sequence = await context.getTimelineSequence(output.timeline.id);
    identity(sequence.id, fit);
    check(sequence.width === 1080 && sequence.height === 1920 && sequence.templateId === filled.id, `${fit} target dimensions and lineage`);
    check(sequence.clips.every((clip, i) => clip.startMs === filled.clips[i].startMs && clip.durationMs === filled.clips[i].durationMs), `${fit} keeps timings`);
    check(fit === 'cover' ? output.cropped.includes(source.clips[0].id) : output.cropped.length === 0, `${fit} crop report`);
    retargets[fit] = { output, sequence };
  }
  check(JSON.stringify(await context.getTimelineSequence(source.id)) === before, 'retarget leaves template unchanged');
  check(JSON.stringify(await context.getTimelineSequence(filled.id)) === JSON.stringify(filled), 'retarget leaves filled input unchanged');
  const transcript = await Object.assign(new TimelineTranscriptNode(), { timeline: { type: 'timeline', id: filled.id } }).process(context);
  check(transcript.text === 'Spoken line', 'Transcript reads SQLite timeline');
  function stable(value, key) {
    if (typeof value === 'string') {
      if (['createdAt', 'updatedAt'].includes(key)) { check(Number.isFinite(Date.parse(value)), 'valid time'); return '<timestamp>'; }
      return ids.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.map((v) => stable(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stable(v, k)]));
    return value;
  }
  return { result: stable({ added, source, fillOutput, filled, retargets, transcript, failures }), checks };
}
