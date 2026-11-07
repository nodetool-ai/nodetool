// The same stateful contract and real node workflow run in QuickJS and in the
// production TypeScript host. Only generated identities/timestamps are symbolic.
import { FillScriptNode, LoadScriptNode, ScriptToTimelineNode } from '@nodetool-ai/video-nodes/nodes/script';
import { CreateStoryboardNode, LoadStoryboardNode, RecastStoryboardNode } from '@nodetool-ai/video-nodes/nodes/storyboard';
import { SketchLayersNode, CreateSketchNode } from '@nodetool-ai/image-nodes/nodes/sketch';
import { CreateEntityNode, LoadEntityNode, ListEntitiesNode } from '@nodetool-ai/core-nodes/nodes/entity';
import { PNG } from './models-node-fixture.mjs';

export async function documentContractFixture(context, foreign, seed) {
  let checks = 0;
  const assert = (condition, label) => { checks++; if (!condition) throw new Error(`document contract: ${label}`); };
  const errors = {};
  async function reject(label, fn) {
    try { await fn(); } catch (error) { errors[label] = error.message; return; }
    throw new Error(`document contract: ${label} did not reject`);
  }
  const identities = new Map();
  function saved(label, row) {
    assert(row && /^[a-f0-9]{32}$/.test(row.id), `${label} persistent ID`);
    identities.set(row.id, label);
    assert(Number.isFinite(Date.parse(row.createdAt)) && Number.isFinite(Date.parse(row.updatedAt)), `${label} timestamps`);
    assert(Date.parse(row.updatedAt) > Date.parse(row.createdAt), `${label} initial timestamp advances`);
    return row;
  }
  const script = saved('script', await context.createScript({ document: { cast: [], sections: [
    { id: 'section', lines: [{ id: 'line', text: 'Hello {{name}}', takes: [] }] }
  ] } }));
  assert(script.name === 'Untitled script', 'script default name');
  assert((await context.getScript(script.id.slice(0, 12))).id === script.id, 'script exact short ID');
  assert(await foreign.getScript(script.id) === null, 'foreign script denied');
  const updatedScript = await context.updateScript(script.id, { timelineId: 'linked-timeline', baseUpdatedAt: script.updatedAt });
  assert(updatedScript.timelineId === 'linked-timeline' && updatedScript.updatedAt > script.updatedAt, 'script CAS success');
  assert(await context.updateScript(script.id, { document: { cast: [], sections: [] }, baseUpdatedAt: script.updatedAt }) === null, 'stale script CAS');
  assert(await foreign.updateScript(script.id, { timelineId: 'stolen' }) === null, 'foreign script update');
  await reject('invalidScript', () => context.createScript({ document: { cast: [] } }));
  await reject('invalidScriptUpdate', () => context.updateScript(script.id, { document: { sections: [] } }));
  const fill = Object.assign(new FillScriptNode(), { script: { type: 'script', id: script.id }, values: { name: 'Ada' }, name: 'Filled' });
  const filled = await fill.process(context);
  const filledScript = saved('filled-script', await context.getScript(filled.script.id));
  assert(filledScript.document.templateId === script.id, 'filled script lineage');
  const loadedScript = await Object.assign(new LoadScriptNode(), { script: filled.script }).process(context);
  assert(loadedScript.text === 'Hello Ada', 'real script nodes read/write');

  const image = saved('sketch', await context.createImageDocument({ name: 'Sketch', width: 16, height: 8,
    document: { sketch: { version: 3, canvas: { width: 16, height: 8 }, layers: [], activeLayerId: null }, layerBindings: [] } }));
  assert((await context.getImageDocument(image.id.slice(0, 12))).width === 16, 'sketch read by short ID');
  assert(await foreign.getImageDocument(image.id) === null, 'foreign sketch denied');
  await reject('invalidSketch', () => context.createImageDocument({ name: 'bad', width: 1, height: 1, document: { layerBindings: [] } }));
  const layers = await Object.assign(new SketchLayersNode(), { sketch: { type: 'sketch', id: image.id } }).process(context);
  assert(layers.layers.length === 0 && layers.names.length === 0, 'real sketch node reads persisted document');

  const createdSketchOutput = await Object.assign(new CreateSketchNode(), { name: 'Created sketch',
    image: { type: 'image', data: new Uint8Array(PNG) } }).process(context);
  const createdSketch = saved('node-sketch', await context.getImageDocument(createdSketchOutput.output.id));
  const layerData = createdSketch.document.sketch.layers[0].data;
  assert(layerData.startsWith('ntlayer:'), 'real CreateSketch persists editor layer format');
  const layerPayload = JSON.parse(Buffer.from(layerData.slice('ntlayer:'.length), 'base64').toString('utf8'));
  assert(layerPayload.image.startsWith('data:image/png;base64,'), 'created sketch raster is PNG');
  const decoded = await seed.decodeImage(new Uint8Array(Buffer.from(layerPayload.image.split(',')[1], 'base64')));
  assert(decoded.width === 1 && decoded.height === 1 && decoded.rgba.length === 4, 'created sketch raster decodes');
  const createdSketchNode = { name: createdSketch.name, width: createdSketch.width, height: createdSketch.height,
    bounds: layerPayload.bounds, pixels: Array.from(decoded.rgba), layerBindings: createdSketch.document.layerBindings };
  const sequence = saved('timeline', await context.createTimelineSequence({ id: '1234567890abcdef1234567890abcdef', projectId: 'default',
    name: 'Timeline', fps: 24, width: 320, height: 180, durationMs: 4000, tracks: [], clips: [], markers: [],
    transcript: [{ id: 'speech', text: 'Hello {{name}}', startMs: 0, endMs: 4000 }],
    createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }));
  const timelineUpdate = await context.updateTimelineSequence(sequence.id, { ...sequence, name: 'Changed', durationMs: 5000 });
  assert(timelineUpdate.name === 'Changed' && timelineUpdate.durationMs === 5000 && timelineUpdate.updatedAt > sequence.updatedAt, 'timeline CAS update');
  assert(await context.updateTimelineSequence(sequence.id, { ...sequence, name: 'Stale' }) === null, 'timeline stale CAS');
  assert((await context.getTimelineSequence(sequence.id)).name === 'Changed', 'stale timeline did not overwrite');
  assert(await foreign.getTimelineSequence(sequence.id) === null, 'foreign timeline denied');
  assert(await foreign.updateTimelineSequence(sequence.id, sequence) === null, 'foreign timeline update denied');
  await reject('invalidTimeline', () => context.createTimelineSequence({ ...sequence, id: undefined, clips: null }));
  const voicedScript = saved('voiced-script', await context.createScript({ name: 'Voiced script', document: { cast: [], sections: [
    { id: 'voiced-section', lines: [{ id: 'voiced-line', text: 'Hello', currentTakeId: 'take', takes: [{
      id: 'take', assetId: 'audio-fixture', durationMs: 1000, words: [], textSnapshot: 'Hello', voiceSnapshot: null
    }] }] }
  ] } }));
  const assemble = Object.assign(new ScriptToTimelineNode(), { script: { type: 'script', id: voicedScript.id } });
  const assembled = await assemble.process(context);
  const filledTimeline = saved('assembled-timeline', await context.getTimelineSequence(assembled.output.id));
  assert(filledTimeline.clips.length === 1 && filledTimeline.durationMs === 1000, 'real script-to-timeline creates persisted timeline');
  const reassembled = await assemble.process(context);
  assert(reassembled.output.id === filledTimeline.id, 'real script-to-timeline updates linked timeline');
  for (const [index, track] of filledTimeline.tracks.entries()) {
    assert(/^[a-f0-9]{32}$/.test(track.id), 'generated track ID'); identities.set(track.id, `track-${index}`);
  }
  for (const [index, clip] of filledTimeline.clips.entries()) {
    assert(/^[a-f0-9]{32}$/.test(clip.id), 'generated clip ID');
    assert(filledTimeline.tracks.some((track) => track.id === clip.trackId), 'clip references created track');
    identities.set(clip.id, `clip-${index}`);
  }
  const transcript = (await context.getTimelineSequence(sequence.id)).transcript;

  const rawBoard = saved('recast-board', await context.createStoryboard({ document: {
    shots: [{ id: 'raw-shot', index: 0, entity_ids: ['hero'] }], screenplay: { shots: [] }, templateId: 'template', recastKey: 'key'
  } }));
  assert(rawBoard.name === 'Untitled storyboard' && rawBoard.document.entityIds.includes('hero'), 'board reconciliation/defaults');
  assert(rawBoard.document.screenplay.shots.length === 1, 'board screenplay shots reconciled');
  assert((await context.findRecastStoryboard({ projectId: 'default', templateId: 'template', recastKey: 'key' })).id === rawBoard.id, 'scoped recast lookup');
  assert(await foreign.findRecastStoryboard({ templateId: 'template', recastKey: 'key' }) === null, 'foreign recast denied');
  assert((await context.getStoryboard(rawBoard.id.slice(0, 12))).id === rawBoard.id, 'short storyboard ID');
  const boardUpdate = await context.updateStoryboard(rawBoard.id, { timelineId: sequence.id, baseUpdatedAt: rawBoard.updatedAt });
  assert(boardUpdate.timelineId === sequence.id && boardUpdate.updatedAt > rawBoard.updatedAt, 'board CAS update');
  assert(await context.updateStoryboard(rawBoard.id, { timelineId: 'stale', baseUpdatedAt: rawBoard.updatedAt }) === null, 'stale board CAS');
  assert(await foreign.updateStoryboard(rawBoard.id, { timelineId: 'stolen' }) === null, 'foreign board update');
  await reject('invalidBoard', () => context.createStoryboard({ document: { shots: {} } }));
  await reject('invalidBoardUpdate', () => context.updateStoryboard(rawBoard.id, { document: {} }));
  const createBoard = Object.assign(new CreateStoryboardNode(), { name: 'Node board', brief: 'fixture', project: '',
    screenplay: { title: 'Node board', shots: [{ id: 'shot-1', index: 0, prompt: 'A hero', description: 'A hero' }] },
    cast: [], reuse_existing: true, image_model: {}, video_model: {} });
  const boardNode = await createBoard.process(context);
  const board = saved('node-board', await context.getStoryboard(boardNode.storyboard.id));
  const reuse = await createBoard.process(context);
  assert(boardNode.created && !reuse.created && reuse.storyboard.id === board.id, 'real board node reuses persisted row');
  const loadedBoard = await Object.assign(new LoadStoryboardNode(), { storyboard: boardNode.storyboard }).process(context);
  assert(loadedBoard.shot_count === 1, 'real storyboard node read');
  const listed = await context.listStoryboards({ limit: 1 });
  assert(listed.length === 1 && listed[0].id === board.id, 'board ordering/limit');
  assert((await foreign.listStoryboards()).length === 0, 'foreign list isolation');
  assert((await context.findRecastStoryboard({ templateId: 'template', recastKey: 'key' })).id === rawBoard.id, 'recast not constrained by list limit');

  const firstImage = await context.createAsset({ name: 'hero.png', contentType: 'image/png', content: new Uint8Array(PNG) });
  const secondImage = await context.createAsset({ name: 'other.png', contentType: 'image/png', content: new Uint8Array(PNG) });
  identities.set(firstImage.id, 'hero-image'); identities.set(secondImage.id, 'other-image');
  const makeEntity = Object.assign(new CreateEntityNode(), { name: 'Hero', kind: 'character', descriptor: 'A hero',
    description: 'Keep me', tags: ['hero', 'cast'], voice_id: 'voice', key: 'sku-one',
    image: { type: 'image', asset_id: firstImage.id } });
  const entity = await makeEntity.process(context);
  assert(entity.created && entity.entity.id === firstImage.id, 'real entity node create');
  const reread = await Object.assign(new LoadEntityNode(), { entity: { type: 'entity', id: firstImage.id }, name: '' }).process(context);
  assert(reread.name === 'Hero' && reread.descriptor === 'A hero', 'real entity node read');
  const replaced = await context.upsertEntity({ kind: 'character', name: 'Hero', descriptor: 'Updated', imageAssetId: secondImage.id, source: { key: 'sku-one' } });
  assert(!replaced.created && replaced.entity.id === firstImage.id, 'source upsert preserves identity');
  assert(replaced.entity.description === 'Keep me' && replaced.entity.tags.includes('cast'), 'upsert preserves optional fields');
  assert(replaced.entity.reference_images[0].asset_id === secondImage.id, 'upsert swaps picture without moving marker');
  const distinct = await context.upsertEntity({ kind: 'character', name: 'Hero', descriptor: 'Different SKU', imageAssetId: secondImage.id, source: { key: 'sku-two' } });
  assert(distinct.created && distinct.entity.id === secondImage.id, 'different source key does not merge by name');
  const cleared = await context.upsertEntity({ kind: 'character', name: 'Hero', descriptor: 'Updated', imageAssetId: firstImage.id, voiceId: null, source: { key: 'sku-one' } });
  assert(cleared.entity.voice_id === null, 'null voice removes saved voice');
  const entityList = await Object.assign(new ListEntitiesNode(), { project: '', kind: 'character', tags: ['cast'], name_contains: 'HERO' }).process(context);
  assert(entityList.entities.length === 1 && entityList.entities[0].id === firstImage.id, 'real entity list filters');
  assert((await context.listEntities({ limit: 0 })).length === 0, 'entity zero limit');
  assert(await foreign.getEntity(firstImage.id) === null && (await foreign.listEntities()).length === 0, 'foreign entity isolation');
  assert((await context.getEntity(firstImage.id.slice(0, 12))).id === firstImage.id, 'short entity ID');
  await reject('foreignEntityImage', () => foreign.upsertEntity({ kind: 'character', name: 'stolen', descriptor: '', imageAssetId: firstImage.id }));
  await reject('missingEntityImage', () => context.upsertEntity({ kind: 'character', name: 'bad', descriptor: '', imageAssetId: 'missing' }));
  const textAsset = await context.createAsset({ name: 'text.txt', contentType: 'text/plain', content: new Uint8Array([65]) });
  await reject('nonImageEntity', () => context.upsertEntity({ kind: 'character', name: 'bad', descriptor: '', imageAssetId: textAsset.id }));
  assert(await context.getEntity(textAsset.id) === null, 'non-marker asset not an entity');

  const castBoard = await context.updateStoryboard(rawBoard.id, { document: { ...rawBoard.document,
    entityIds: [firstImage.id], shots: [{ id: 'cast-shot', index: 0, entity_ids: [firstImage.id], action: 'Hero walks' }] } });
  const recastNode = Object.assign(new RecastStoryboardNode(), { storyboard: { type: 'storyboard', id: castBoard.id },
    cast: [distinct.entity], replaces: [firstImage.id], name: 'Recast board', reuse_existing: true });
  const recastOutput = await recastNode.process(context);
  const recastBoard = saved('recast-copy', await context.getStoryboard(recastOutput.storyboard.id));
  assert(recastBoard.document.templateId === rawBoard.id, 'real recast node persists template lineage');
  const reusedRecast = await recastNode.process(context);
  assert(reusedRecast.storyboard.id === recastBoard.id, 'real recast node uses scoped lookup and updates prior copy');
  await seed.createProject('alice', 'project-owned', null);
  await seed.createProject('alice', 'project-deleted', '2020-01-01T00:00:00.000Z');
  const projectBoard = saved('project-board', await context.createStoryboard({ projectId: 'project-owned', document: { shots: [] } }));
  assert(projectBoard.projectId === 'project-owned', 'owned project accepted');
  assert((await context.listStoryboards({ projectId: 'project-owned' })).length === 1, 'project list scoped');
  assert((await foreign.listStoryboards({ projectId: 'project-owned' })).length === 0, 'foreign project list denied');
  await reject('unknownProject', () => context.createScript({ projectId: 'project-missing', document: { cast: [], sections: [] } }));
  await reject('foreignProject', () => foreign.createStoryboard({ projectId: 'project-owned', document: { shots: [] } }));
  await reject('deletedProject', () => context.createImageDocument({ name: 'deleted', projectId: 'project-deleted', document: { sketch: {}, layerBindings: [] } }));
  const systemAsset = await context.createAsset({ name: 'System style', contentType: 'image/png', content: new Uint8Array(PNG),
    metadata: { nodetool_entity: { system: true, kind: 'style', name: 'System style', descriptor: 'preset' } } });
  await reject('systemEntity', () => context.upsertEntity({ kind: 'style', name: 'System style', descriptor: 'changed', imageAssetId: systemAsset.id }));
  const projectEntity = await context.upsertEntity({ kind: 'character', name: 'Hero', descriptor: 'Project hero', imageAssetId: firstImage.id,
    projectId: 'project-owned', source: { key: 'sku-one' } });
  assert(projectEntity.entity.project_id === 'project-owned', 'entity moved to owned project');
  assert((await context.listEntities({ projectId: 'project-owned' })).length === 1, 'project entity filter');
  const defaultScript = saved('default-script', await context.createScript({}));
  const defaultBoard = saved('default-board', await context.createStoryboard({}));
  const defaultSketch = saved('default-sketch', await context.createImageDocument({ name: 'Default sketch' }));
  function stable(value, key) {
    if (typeof value === 'string') {
      if (['createdAt', 'updatedAt', 'created_at', 'updated_at'].includes(key)) {
        assert(Number.isFinite(Date.parse(value)), 'timestamp field is ISO time'); return '<timestamp>';
      }
      for (const [identity, label] of identities) value = value.replaceAll(identity, `<${label}>`);
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => stable(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([name, item]) => [name, stable(item, name)]));
    return value;
  }
  const result = stable({ defaultScript, defaultBoard, defaultSketch, projectBoard, recastBoard, createdSketchNode, script: await context.getScript(script.id), filledScript, scriptNode: loadedScript,
    sketch: await context.getImageDocument(image.id), sketchNode: layers,
    timeline: await context.getTimelineSequence(sequence.id), filledTimeline, transcript,
    storyboard: await context.getStoryboard(rawBoard.id), board, boardNode: loadedBoard,
    entity: await context.getEntity(firstImage.id), entities: entityList.entities, errors });
  return { checks, result };
}
