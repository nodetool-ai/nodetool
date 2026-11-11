// SQLite DAL for ProcessingContext's document ports. Calling conventions,
// validators, response shapes and CAS rules follow packages/document-services/src/index.ts
// and packages/models/src/{image-document,script,storyboard,timeline-sequence,entity}.ts.
// Protocol readers/reconciliation remain the production implementations.
import { ENTITY_METADATA_KEY, readEntityMarker, isRecord, isSystemEntityMetadata, boardEntityIdsWithShots } from '@nodetool-ai/protocol';

function nextUpdatedAtAfter(previous) {
  const now = Date.now(), before = Date.parse(previous);
  return new Date(Number.isFinite(before) ? Math.max(now, before + 1) : now).toISOString();
}
let lastBoardUpdate = 0;
function timestamp(kind, previous) {
  const value = nextUpdatedAtAfter(previous);
  if (kind !== 'storyboards') return value;
  lastBoardUpdate = Math.max(Date.parse(value), lastBoardUpdate + 1);
  return new Date(lastBoardUpdate).toISOString();
}
function validate(kind, document) {
  if (kind === 'scripts') {
    if (!document || typeof document !== 'object' || !Array.isArray(document.sections) || !Array.isArray(document.cast)) {
      throw new Error('script document must contain cast and sections arrays');
    }
  } else if (kind === 'storyboards') {
    if (!document || typeof document !== 'object' || !Array.isArray(document.shots)) {
      throw new Error('storyboard document must contain a shots array');
    }
  } else if (kind === 'images') {
    if (!document.sketch || !Array.isArray(document.layerBindings)) throw new Error('document must contain sketch and layerBindings');
  } else if (kind === 'timelines') {
    if (!Array.isArray(document.tracks) || !Array.isArray(document.clips) || !Array.isArray(document.markers)) {
      throw new Error('document must contain tracks, clips, and markers arrays');
    }
  }
}
function response(kind, row) {
  if (!row) return null;
  const document = JSON.parse(row.document);
  const common = { id: row.id, projectId: row.project_id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
  if (kind === 'timelines') {
    return { ...common, workflowId: row.workflow_id ?? undefined, fps: row.fps, width: row.width, height: row.height,
      durationMs: row.duration_ms, ...Object.fromEntries(TIMELINE_FIELDS.map((field) => [field, document[field]])), transcript: document.transcript ?? [] };
  }
  if (kind === 'images') {
    return { ...common, workflowId: row.workflow_id ?? undefined, width: row.width, height: row.height,
      backgroundColor: row.background_color, document, thumbnailAssetId: row.thumbnail_asset_id ?? undefined };
  }
  if (kind === 'scripts') {
    document.cast ??= [];
    document.sections ??= [];
  } else {
    document.entityIds ??= [];
    document.look_preset_ids ??= [];
    document.setupStage ??= 'done';
    document.genre ??= '';
    if (document.screenplay) document.screenplay.shots = document.shots;
    document.entityIds = [...boardEntityIdsWithShots(document.entityIds, document.shots ?? [])];
  }
  const out = { ...common, document, timelineId: row.timeline_id ?? undefined };
  if (kind === 'scripts') out.storyboardId = row.storyboard_id ?? undefined;
  return out;
}
// The persisted timeline JSON contains these fields, not the identity/scalar columns.
const TIMELINE_FIELDS = ['dropFrame', 'tracks', 'trackFolders', 'clips', 'markers', 'storyboardMaterializations',
  'transcript', 'scriptEnabled', 'tempo', 'master', 'camera2d', 'setup', 'templateId', 'source', 'mediaTracks'];
function timelineRow(sequence) {
  const doc = Object.fromEntries(TIMELINE_FIELDS.map((field) => [field, field === 'transcript' ? sequence[field] ?? [] : sequence[field]]));
  return { id: sequence.id, project_id: sequence.projectId, workflow_id: sequence.workflowId ?? null,
    name: sequence.name, fps: sequence.fps ?? 30, width: sequence.width ?? 1920, height: sequence.height ?? 1080,
    duration_ms: sequence.durationMs ?? 0, document: JSON.stringify(doc),
    created_at: sequence.createdAt, updated_at: sequence.updatedAt };
}
function defaultDocument(kind) {
  if (kind === 'scripts') return { cast: [], sections: [] };
  if (kind === 'storyboards') return { screenplay: null, shots: [], brief: '', style: '', entityIds: [], aspectRatio: '16:9',
    setupStage: 'done', genre: '', directorModel: null, imageModel: null, videoModel: null };
  // ImageDocument's historical default document is a 1024px canvas, independently
  // of explicit width/height columns. Preserve that existing constructor contract.
  return { sketch: { version: 3, canvas: { width: 1024, height: 1024, backgroundColor: '#ffffff' }, layers: [{
    id: 'layer-1', name: 'Layer 1', type: 'raster', visible: true, opacity: 1, locked: false, alphaLock: false,
    blendMode: 'normal', data: null, transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 1024, height: 1024 }, effects: []
  }], activeLayerId: 'layer-1', maskLayerId: null, activeTool: 'brush', viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    history: [], historyIndex: -1 }, layerBindings: [] };
}
const ENTITY_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/bmp': 'bmp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'application/octet-stream': 'bin' };
function entityFromRow(asset) {
  if (!asset) return null;
  const marker = readEntityMarker(asset.metadata);
  if (!marker) return null;
  const { reference_asset_id: swapped, ...fields } = marker;
  const reference = swapped && swapped !== asset.id
    ? { type: 'image', asset_id: swapped, uri: `asset://${swapped}` }
    : { type: 'image', asset_id: asset.id, uri: `asset://${asset.id}.${ENTITY_EXT[asset.content_type] ?? 'png'}` };
  const entity = { ...fields, type: 'entity', id: asset.id, project_id: asset.project_id || 'default', reference_images: [reference] };
  if (asset.created_at) entity.created_at = asset.created_at;
  return entity;
}
const norm = (value) => value.trim().toLowerCase();

export function documentModelInterfaces(repository) {
  function create(kind, fields, document, updatedAt) {
    const serialized = JSON.stringify(document) ?? JSON.stringify(defaultDocument(kind));
    // Match JSON round-tripping of the production constructor before validation.
    validate(kind, JSON.parse(serialized));
    const now = new Date().toISOString();
    const time = timestamp(kind, updatedAt ?? now);
    return response(kind, repository.put(kind, { ...fields, document: serialized,
      ...(kind === 'scripts' ? {} : { revision: 1 }) }, { updatedAt: time, createdAt: fields.created_at ?? now }));
  }
  function update(kind, args) {
    const row = repository.get(kind, args.id);
    if (!row) return null;
    const fields = {};
    if (args.document !== undefined) {
      fields.document = JSON.stringify(args.document);
      validate(kind, JSON.parse(fields.document));
    }
    if (args.timelineId !== undefined) fields.timeline_id = args.timelineId;
    const expected = args.baseUpdatedAt ?? row.updated_at;
    return response(kind, repository.compareAndSwap(kind, row.id, expected, fields, {
      updatedAt: timestamp(kind, expected), incrementRevision: kind !== 'scripts'
    }));
  }
  function images(projectId) {
    return repository.query('assets', { prefix: { content_type: 'image' }, equals: projectId ? { project_id: projectId } : {},
      orderBy: 'created_at', descending: true, limit: 1000 });
  }
  return {
    async getImageDocument({ id }) { return response('images', repository.get('images', id)); },
    async createImageDocument({ name, projectId, width, height, document }) {
      return create('images', { name, project_id: projectId ?? 'default', width: width ?? 1024, height: height ?? 1024 }, document);
    },
    async getScript({ id }) { return response('scripts', repository.get('scripts', id)); },
    async createScript({ name, projectId, document }) {
      return create('scripts', { name: name ?? 'Untitled script', project_id: projectId ?? 'default' }, document);
    },
    async updateScript(args) { return update('scripts', args); },
    async getStoryboard({ id }) { return response('storyboards', repository.get('storyboards', id)); },
    async createStoryboard({ name, projectId, document }) {
      return create('storyboards', { name: name ?? 'Untitled storyboard', project_id: projectId ?? 'default' }, document);
    },
    async updateStoryboard(args) { return update('storyboards', args); },
    async listStoryboards({ projectId, limit }) {
      return repository.query('storyboards', { equals: projectId ? { project_id: projectId } : {}, orderBy: 'updated_at',
        descending: true, limit: limit ?? 50 }).map((row) => response('storyboards', row));
    },
    async findRecastStoryboard({ projectId, templateId, recastKey }) {
      return response('storyboards', repository.findRecast({ projectId, templateId, recastKey }));
    },
    async getTimelineSequence({ id }) { return response('timelines', repository.get('timelines', id)); },
    async createTimelineSequence({ sequence }) {
      const row = timelineRow(sequence);
      return create('timelines', row, JSON.parse(row.document), row.updated_at);
    },
    async updateTimelineSequence({ id, sequence }) {
      const existing = repository.get('timelines', id);
      if (!existing) return null;
      const next = timelineRow(sequence);
      validate('timelines', JSON.parse(next.document));
      const expected = next.updated_at ?? new Date().toISOString();
      const { name, fps, width, height, duration_ms, document } = next;
      return response('timelines', repository.compareAndSwap('timelines', existing.id, expected,
        { name, fps, width, height, duration_ms, document }, { updatedAt: timestamp('timelines', expected), incrementRevision: true }));
    },
    async getEntity({ id }) { return entityFromRow(repository.get('assets', id)); },
    async listEntities({ projectId, kind, tags, nameContains, limit }) {
      const wanted = nameContains ? norm(nameContains) : '';
      const matched = images(projectId).map(entityFromRow).filter((entity) => entity !== null)
        .filter((entity) => (!kind || entity.kind === kind) && (!wanted || norm(entity.name).includes(wanted))
          && (!tags?.length || tags.every((tag) => (entity.tags ?? []).includes(tag))));
      return limit !== undefined ? matched.slice(0, Math.max(limit, 0)) : matched;
    },
    async upsertEntity(args) {
      const image = repository.get('assets', args.imageAssetId);
      if (!image) throw new Error(`Asset ${args.imageAssetId} was not found`);
      if (!image.content_type.startsWith('image/')) throw new Error(`${image.name || image.id} is a ${image.content_type} asset; entities are image assets`);
      const candidates = images(args.projectId).map((asset) => [asset, readEntityMarker(asset.metadata)]);
      const key = args.source?.key?.trim();
      let target = key ? candidates.find(([, marker]) => marker?.source?.key === key)?.[0] : null;
      target ??= candidates.find(([, marker]) => marker && marker.kind === args.kind && norm(marker.name) === norm(args.name)
        && (!key || !marker.source?.key?.trim()))?.[0];
      const created = !target;
      target ??= image;
      if (isSystemEntityMetadata(target.metadata)) {
        throw new Error(`"${target.name || target.id}" is a shipped style preset and cannot be changed. Use "Add your own style" to make an editable copy.`);
      }
      const raw = target.metadata?.[ENTITY_METADATA_KEY];
      const marker = isRecord(raw) ? { ...raw } : {};
      Object.assign(marker, { kind: args.kind, name: args.name, descriptor: args.descriptor });
      if (args.description !== undefined) marker.description = args.description;
      if (args.tags !== undefined) marker.tags = args.tags;
      if (args.voiceId !== undefined) {
        if (args.voiceId === null) delete marker.voice_id;
        else marker.voice_id = args.voiceId;
      }
      if (args.source !== undefined) marker.source = { ...args.source };
      if (image.id !== target.id) marker.reference_asset_id = image.id;
      else delete marker.reference_asset_id;
      const saved = repository.put('assets', { ...target, metadata: { ...(target.metadata ?? {}), [ENTITY_METADATA_KEY]: marker },
        ...(args.projectId ? { project_id: args.projectId } : {}) });
      const entity = entityFromRow(saved);
      if (!entity) throw new Error(`Entity marker on asset ${saved.id} was not readable`);
      return { entity, created };
    }
  };
}
