// Persistence is opt-in. SQLite uses the production tables and column codecs.
// Document/entity DAL ports use the same production schemas and may be explicitly overridden.
import { randomUUID } from './crypto.mjs';
import Database from 'better-sqlite3';
import { and, asc, desc, eq, getTableColumns, gt, lt, or, sql, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { assets, jobs, workflows, resolveResourceId, ASSET_FAVORITE_DDL, JOB_TRACE_MARKER_DDL } from '@nodetool-ai/models-core';
import { appSettings } from 'guest-real:@nodetool-ai/models/schema/settings.js';
import { messages } from 'guest-real:@nodetool-ai/models/schema/messages.js';
import { threads } from 'guest-real:@nodetool-ai/models/schema/threads.js';
import { applySqliteBaseline } from './models-baseline.cjs';
import { getAssetFileName } from '@nodetool-ai/protocol';
import { normalizeAssetContentType } from 'guest-real:@nodetool-ai/asset-services/asset-paths.js';
import { scripts } from 'guest-real:@nodetool-ai/models/schema/scripts.js';
import { storyboards } from 'guest-real:@nodetool-ai/models/schema/storyboards.js';
import { imageDocuments } from 'guest-real:@nodetool-ai/models/schema/image-documents.js';
import { timelineSequences } from 'guest-real:@nodetool-ai/models/schema/timeline-sequences.js';
import { projects } from 'guest-real:@nodetool-ai/models/schema/projects.js';
import { documentModelInterfaces } from './models-documents.mjs';
import * as fs from './fs.mjs';

export const MODEL_METHODS = Object.freeze([
  'getSetting', 'getJob', 'createAsset', 'updateAssetBytes', 'listFolderAssets',
  'getAssetInfo', 'createMessage', 'getMessages', 'getImageDocument',
  'createImageDocument', 'getTimelineSequence', 'createTimelineSequence',
  'updateTimelineSequence', 'getScript', 'createScript', 'updateScript',
  'getStoryboard', 'listStoryboards', 'findRecastStoryboard', 'createStoryboard',
  'updateStoryboard', 'listEntities', 'getEntity', 'upsertEntity'
]);

const tables = { assets, jobs, workflows, settings: appSettings, messages, threads, scripts, storyboards, images: imageDocuments, timelines: timelineSequences, projects };
const id = () => randomUUID().replaceAll('-', '');
const info = (asset) => asset && ({ id: asset.id, name: asset.name, content_type: asset.content_type, metadata: asset.metadata ?? null });
function limitValue(value, fallback = 1000) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new RangeError('limit must be an integer between 1 and 10000');
  return n;
}

/** A repository bound to one run owner. Transactions are synchronous, as in better-sqlite3. */
export function openModelRepository(databasePath, userId) {
  if (!userId) throw new Error('A resource owner is required');
  if (typeof databasePath !== 'string' || !databasePath) throw new Error('An explicit model database path is required');
  const client = new Database(databasePath);
  let db;
  try {
    client.pragma('journal_mode = WAL');
    client.pragma('busy_timeout = 5000');
    applySqliteBaseline(client);
    client.transaction(() => {
      if (!client.pragma('table_info("nodetool_assets")').some((column) => column.name === 'favorite')) client.exec(ASSET_FAVORITE_DDL);
      if (!client.pragma('table_info("nodetool_jobs")').some((column) => column.name === 'has_run_trace')) client.exec(JOB_TRACE_MARKER_DDL);
      // The 20261110_000000 add_thread_kind migration in @nodetool-ai/models.
      if (!client.pragma('table_info("nodetool_threads")').some((column) => column.name === 'kind')) client.exec("ALTER TABLE nodetool_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'");
    })();
    db = drizzle(client);
  } catch (error) {
    client.close();
    throw error;
  }
  function tableFor(kind) {
    const table = Object.hasOwn(tables, kind) && tables[kind];
    if (!table) throw new Error(`Unsupported model table: ${kind}`);
    return table;
  }
  function list(kind) {
    const table = tableFor(kind);
    return db.select().from(table).where(eq(table.user_id, userId)).all();
  }
  function get(kind, key) {
    if (typeof key !== 'string') throw new TypeError('Resource ID must be a string');
    const table = tableFor(kind);
    if (/^[0-9a-f]{12}$/.test(key)) return resolveResourceId(list(kind), key);
    return db.select().from(table).where(and(eq(table.user_id, userId), eq(table.id, key))).get() ?? null;
  }
  function put(kind, document, options = {}) {
    const table = tableFor(kind);
    const existing = document.id ? get(kind, document.id) : null;
    if (!existing && /^[0-9a-f]{12}$/.test(document.id ?? '')) throw new Error('Resource prefix not found');
    const now = new Date().toISOString();
    const data = { ...existing, ...document, id: existing?.id ?? document.id ?? id(), user_id: userId,
      created_at: existing?.created_at ?? options.createdAt ?? now, updated_at: options.updatedAt ?? now };
    // Only schema columns cross the persistence seam. Drizzle applies the real codecs.
    const columns = getTableColumns(table);
    const values = Object.fromEntries(Object.entries(data).filter(([key]) => Object.hasOwn(columns, key)));
    client.transaction(() => {
      if (typeof data.project_id === 'string' && data.project_id !== 'default') {
        const project = get('projects', data.project_id);
        if (!project) throw new Error('Project not found');
        if (project.deleted_at) throw new Error('Project has been deleted');
      }
      db.insert(table).values(values).onConflictDoUpdate({ target: table.id,
        set: values, setWhere: eq(table.user_id, userId) }).run();
    })();
    const saved = get(kind, data.id);
    if (!saved) throw new Error('Resource ID is already owned by another user');
    return saved;
  }
  function ensureThread(threadId, create = false) {
    const thread = get('threads', threadId);
    if (thread || !create) return thread;
    // A missing named/full ID is reserved on write. Unknown prefixes remain
    // unresolved, and put refuses foreign collisions and invalid short IDs.
    return put('threads', { id: threadId, title: '' });
  }
  return {
    get, put, list, ensureThread,
    compareAndSwap(kind, key, expected, fields, { updatedAt, incrementRevision = false }) {
      const row = get(kind, key);
      if (!row) return null;
      const table = tableFor(kind);
      const rows = db.update(table).set({ ...fields, updated_at: updatedAt,
        ...(incrementRevision ? { revision: sql`${table.revision} + 1` } : {}) })
        .where(and(eq(table.user_id, userId), eq(table.id, row.id), eq(table.updated_at, expected)))
        .returning().all();
      return rows[0] ?? null;
    },
    query(kind, { equals = {}, prefix = {}, orderBy, descending = false, limit } = {}) {
      const table = tableFor(kind), columns = getTableColumns(table);
      const conditions = [eq(table.user_id, userId)];
      for (const [name, value] of Object.entries(equals)) {
        if (!Object.hasOwn(columns, name)) throw new Error(`Unknown column: ${name}`);
        conditions.push(eq(columns[name], value));
      }
      for (const [name, value] of Object.entries(prefix)) {
        if (!Object.hasOwn(columns, name)) throw new Error(`Unknown column: ${name}`);
        conditions.push(like(columns[name], `${value}%`));
      }
      let query = db.select().from(table).where(and(...conditions));
      if (orderBy) {
        if (!Object.hasOwn(columns, orderBy)) throw new Error(`Unknown column: ${orderBy}`);
        query = query.orderBy((descending ? desc : asc)(columns[orderBy]));
      }
      if (limit !== undefined) query = query.limit(limit);
      return query.all();
    },
    findRecast({ projectId, templateId, recastKey }) {
      return db.select().from(storyboards).where(and(eq(storyboards.user_id, userId),
        projectId ? eq(storyboards.project_id, projectId) : undefined,
        eq(sql`json_extract(${storyboards.document}, '$.templateId')`, templateId),
        eq(sql`json_extract(${storyboards.document}, '$.recastKey')`, recastKey)))
        .orderBy(desc(storyboards.updated_at)).limit(1).get() ?? null;
    },
    delete(kind, key) {
      const existing = get(kind, key);
      if (!existing) return false;
      const table = tableFor(kind);
      return db.delete(table).where(and(eq(table.user_id, userId), eq(table.id, existing.id))).run().changes > 0;
    },
    transaction(fn) { return client.transaction(() => fn(this))(); },
    getMessages({ threadId, limit, startKey, reverse = false }) {
      const count = limitValue(limit);
      const canonicalThreadId = ensureThread(threadId)?.id ?? threadId;
      const where = [eq(messages.user_id, userId), eq(messages.thread_id, canonicalThreadId)];
      if (startKey) {
        const cursor = get('messages', startKey);
        if (!cursor || cursor.thread_id !== canonicalThreadId) throw new Error('Message cursor not found');
        const compare = reverse ? lt : gt;
        where.push(or(compare(messages.created_at, cursor.created_at),
          and(eq(messages.created_at, cursor.created_at), compare(messages.id, cursor.id))));
      }
      const order = reverse ? desc : asc;
      const rows = db.select().from(messages).where(and(...where))
        .orderBy(order(messages.created_at), order(messages.id)).limit(count + 1).all();
      const more = rows.length > count;
      if (more) rows.pop();
      return { messages: rows, next: more ? rows[rows.length - 1].id : null };
    },
    close() { client.close(); }
  };
}

function assetId(uri, userId) {
  if (typeof uri !== 'string') throw new TypeError('Asset URI must be a string');
  let raw = uri.trim().replace(/^asset:\/\//, '').replace(/^\/?api\/storage\//, '').split(/[?#]/)[0];
  try { raw = decodeURIComponent(raw); } catch { throw new Error('Invalid asset URI encoding'); }
  if (raw.startsWith(`${userId}/`)) raw = raw.slice(userId.length + 1);
  // Never interpret arbitrary URLs or traversal as persistent IDs.
  if (raw.includes('/') || raw === '..' || raw.includes('\\')) return null;
  return raw;
}

/**
 * callbacks is an explicit grant of ProcessingContextModelInterfaces functions.
 * It is not taken from a process global or environment. The owner is immutable.
 * assetRoot also needs a files grant, checked by realpath/stat before returning a path.
 */
export function createGuestModels({ userId, databasePath, assetStorage = null, assetRoot = null, callbacks = {} }) {
  if (!userId) throw new Error('A resource owner is required');
  const repository = databasePath ? openModelRepository(databasePath, userId) : null;
  const interfaces = {};
  const owned = (args) => {
    if (args.userId !== userId) throw new Error('Model operation is not authorized for this user');
    return args;
  };
  const readAsset = (uri) => {
    const key = assetId(uri, userId);
    if (key === null) return null;
    const exact = repository.get('assets', key);
    if (exact) return exact;
    const withoutExtension = key.replace(/\.[A-Za-z0-9]+$/, '');
    return withoutExtension === key ? null : repository.get('assets', withoutExtension);
  };
  const keyFor = (asset) => `${userId}/${getAssetFileName(asset.id, asset.content_type)}`;
  if (repository) {
    Object.assign(interfaces, documentModelInterfaces(repository), {
      async getJob({ jobId }) { return repository.get('jobs', jobId); },
      async getSetting({ key }) {
        const setting = repository.list('settings').find((row) => row.key === key);
        return setting?.value || null;
      },
      async getAssetInfo({ assetId: key }) { return info(readAsset(key)); },
      async listFolderAssets({ folderId }) {
        const folder = readAsset(folderId);
        if (!folder || folder.content_type !== 'folder') return null;
        const byParent = new Map();
        for (const asset of repository.list('assets')) {
          if (!byParent.has(asset.parent_id)) byParent.set(asset.parent_id, []);
          byParent.get(asset.parent_id).push(asset);
        }
        const queue = [folder.id], seen = new Set(), out = [];
        for (let i = 0; i < queue.length; i++) {
          const parent = queue[i];
          if (seen.has(parent)) continue;
          seen.add(parent);
          for (const asset of byParent.get(parent) ?? []) {
            if (asset.content_type === 'folder') queue.push(asset.id);
            else out.push({ id: asset.id, name: asset.name, content_type: asset.content_type });
          }
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
      },
      async createMessage({ req }) {
        const thread = repository.ensureThread(req.thread_id, true);
        return repository.put('messages', { thread_id: thread.id, role: req.role,
          name: req.name ?? null, content: req.content ?? null, tool_calls: req.tool_calls ?? null,
          tool_call_id: req.tool_call_id ?? null, workflow_id: req.workflow_id ?? null });
      },
      async getMessages(args) { return repository.getMessages(args); }
    });
    if (assetStorage) {
      interfaces.createAsset = async (args) => {
        if (!(args.content instanceof Uint8Array)) throw new TypeError('Asset content must be Uint8Array');
        const asset = { id: id(), name: args.name, content_type: normalizeAssetContentType(args.contentType ?? '', args.name),
          user_id: userId, parent_id: args.parentId ?? userId, project_id: args.projectId ?? 'default',
          workflow_id: args.workflowId ?? null, node_id: args.nodeId ?? null, job_id: args.jobId ?? null,
          metadata: args.metadata ?? null, size: args.content.byteLength };
        const key = keyFor(asset);
        const uri = await assetStorage.store(key, args.content, asset.content_type);
        try { return repository.put('assets', asset); }
        catch (error) { await assetStorage.delete(uri); throw error; }
      };
      interfaces.updateAssetBytes = async (args) => {
        const asset = readAsset(args.assetId);
        if (!asset) return null;
        if (asset.external_path) throw new Error('Cannot overwrite an externally referenced asset');
        if (!(args.content instanceof Uint8Array)) throw new TypeError('Asset content must be Uint8Array');
        const changed = { ...asset, name: args.name ?? asset.name,
          content_type: normalizeAssetContentType(args.contentType ?? asset.content_type, args.name ?? asset.name),
          size: args.content.byteLength };
        const key = keyFor(changed), uri = assetStorage.uriForKey(key);
        const previous = await assetStorage.retrieve(uri);
        await assetStorage.store(key, args.content, changed.content_type);
        try { return info(repository.put('assets', changed)); }
        catch (error) {
          if (previous !== null) await assetStorage.store(key, previous, asset.content_type);
          else await assetStorage.delete(uri);
          throw error;
        }
      };
    }
  }
  for (const name of MODEL_METHODS) {
    if (Object.hasOwn(callbacks, name)) {
      if (typeof callbacks[name] !== 'function') throw new TypeError(`Model callback ${name} must be a function`);
      interfaces[name] = callbacks[name];
    }
    if (interfaces[name]) {
      const operation = interfaces[name];
      interfaces[name] = (args) => operation(owned(args));
    }
  }
  async function resolveAssetBytes(uri) {
    if (!repository || !assetStorage) throw new Error('Asset persistence is not configured');
    const asset = readAsset(uri);
    if (!asset) return null;
    if (asset.external_path) return new Uint8Array(fs.readFileSync(asset.external_path));
    for (const key of [keyFor(asset), getAssetFileName(asset.id, asset.content_type)]) {
      const bytes = await assetStorage.retrieve(assetStorage.uriForKey(key));
      if (bytes !== null) return bytes;
    }
    return null;
  }
  async function localPath(uri) {
    if (!repository) throw new Error('Asset persistence is not configured');
    const asset = readAsset(uri);
    if (!asset) return null;
    const candidates = asset.external_path ? [asset.external_path]
      : assetRoot ? [keyFor(asset), getAssetFileName(asset.id, asset.content_type)].map((key) => `${assetRoot}/${key}`) : [];
    for (const path of candidates) {
      try {
        // The native files host enforces grants, symlinks and hard links.
        const real = fs.realpathSync(path);
        if (fs.statSync(real).isFile()) return real;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    return null;
  }
  return { interfaces, repository, resolveAssetBytes, localPath, close() { repository?.close(); } };
}
