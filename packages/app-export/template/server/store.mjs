/**
 * The records NodeTool keeps in its database, kept in files instead.
 *
 * Generative nodes save what they make as assets, and timeline, script,
 * storyboard and sketch nodes save documents they read back by id. Inside
 * NodeTool those land in the database. Here an asset is a file in storage at
 * `<userId>/<id>.<ext>`, the key `asset://<id>.<ext>` resolves to, with its
 * name and metadata in `assets.json`. A document is one JSON file under
 * `documents/<kind>/`.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/json": "json",
  "text/plain": "txt",
  "text/markdown": "md",
  "model/gltf-binary": "glb"
};

/** A generated resource id: 32 lowercase hex characters. */
const newId = () => randomUUID().replaceAll("-", "");

const now = () => new Date().toISOString();

const extensionFor = (name, contentType) => {
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  return EXTENSIONS[contentType] ?? "bin";
};

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** One JSON file per record, for a kind of document. */
function documentFolder(dir) {
  mkdirSync(dir, { recursive: true });
  const pathOf = (id) => (/^[0-9a-f]{32}$/.test(id) ? join(dir, `${id}.json`) : null);
  return {
    get(id) {
      const path = pathOf(id);
      return path && existsSync(path) ? readJson(path, null) : null;
    },
    put(record) {
      writeFileSync(join(dir, `${record.id}.json`), JSON.stringify(record));
      return record;
    },
    list() {
      return readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJson(join(dir, file), null))
        .filter(Boolean);
    }
  };
}

/** Merge new fields into a stored document record, or null when it is missing. */
function updateRecord(folder, id, fields) {
  const existing = folder.get(id);
  if (!existing) return null;
  const next = { ...existing, updatedAt: now() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) next[key] = value;
  }
  return folder.put(next);
}

/**
 * The model interfaces a ProcessingContext calls for persistence, backed by
 * files under `dataDir` and the run storage.
 */
export function createLocalStore({ dataDir, storage }) {
  const indexPath = join(dataDir, "assets.json");
  const assets = readJson(indexPath, {});
  const saveIndex = () => writeFileSync(indexPath, JSON.stringify(assets, null, 2));
  const timelines = documentFolder(join(dataDir, "documents", "timelines"));
  const scripts = documentFolder(join(dataDir, "documents", "scripts"));
  const storyboards = documentFolder(join(dataDir, "documents", "storyboards"));
  const sketches = documentFolder(join(dataDir, "documents", "sketches"));

  const assetInfo = (entry) =>
    entry
      ? {
          id: entry.id,
          name: entry.name,
          content_type: entry.content_type,
          metadata: entry.metadata ?? null
        }
      : null;

  const document = (fields) => ({
    id: newId(),
    projectId: fields.projectId ?? "default",
    name: fields.name,
    document: fields.document,
    createdAt: now(),
    updatedAt: now()
  });

  /**
   * The asset a full id or its 12-character short form names. Agents and
   * scripts see the short form; it resolves only when one asset has it.
   */
  const findAsset = (id) => {
    if (assets[id]) return assets[id];
    if (!/^[0-9a-f]{12}$/.test(id)) return null;
    const matches = Object.keys(assets).filter((key) => key.startsWith(id));
    return matches.length === 1 ? assets[matches[0]] : null;
  };

  /** The storage key of an `asset://<id>[.ext]` URI, or null when unknown. */
  const assetKey = (uri) => {
    const id = uri.slice("asset://".length).split(/[?#]/)[0].replace(/\.[^./]+$/, "");
    return findAsset(id)?.key ?? null;
  };

  const interfaces = {
    createAsset: async (args) => {
      const id = newId();
      const ext = extensionFor(args.name, args.contentType);
      const key = `${args.userId}/${id}.${ext}`;
      await storage.store(key, args.content, args.contentType);
      const entry = {
        id,
        key,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null,
        node_id: args.nodeId ?? null,
        job_id: args.jobId,
        workflow_id: args.workflowId,
        metadata: args.metadata ?? null,
        created_at: now()
      };
      assets[id] = entry;
      saveIndex();
      return { ...assetInfo(entry), uri: `asset://${id}.${ext}` };
    },
    updateAssetBytes: async ({ assetId, content, contentType, name }) => {
      const entry = findAsset(assetId);
      if (!entry) return null;
      if (contentType) entry.content_type = contentType;
      if (name) entry.name = name;
      await storage.store(entry.key, content, entry.content_type);
      saveIndex();
      return assetInfo(entry);
    },
    getAssetInfo: async ({ assetId }) => assetInfo(findAsset(assetId)),
    // No folders here: every asset is a file of its own.
    listFolderAssets: async () => null,
    getJob: async () => null,

    getTimelineSequence: async ({ id }) => timelines.get(id),
    createTimelineSequence: async ({ sequence }) => timelines.put({ ...sequence, id: newId() }),
    updateTimelineSequence: async ({ id, sequence }) =>
      timelines.get(id) ? timelines.put({ ...sequence, id }) : null,

    getScript: async ({ id }) => scripts.get(id),
    createScript: async ({ name, projectId, document: body }) =>
      scripts.put(document({ name: name ?? "Untitled script", projectId, document: body })),
    updateScript: async ({ id, document: body, timelineId }) =>
      updateRecord(scripts, id, { document: body, timelineId: timelineId ?? undefined }),

    getStoryboard: async ({ id }) => storyboards.get(id),
    listStoryboards: async ({ limit }) =>
      storyboards
        .list()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit ?? 50),
    // Recast copies are not tracked, so a recast derives a fresh copy each run.
    findRecastStoryboard: async () => null,
    createStoryboard: async ({ name, projectId, document: body }) =>
      storyboards.put(document({ name: name ?? "Untitled storyboard", projectId, document: body })),
    updateStoryboard: async ({ id, document: body, timelineId }) =>
      updateRecord(storyboards, id, { document: body, timelineId: timelineId ?? undefined }),

    getImageDocument: async ({ id }) => sketches.get(id),
    createImageDocument: async ({ name, projectId, width, height, document: body }) =>
      sketches.put({ ...document({ name, projectId, document: body }), width, height })
  };

  return { interfaces, assetKey };
}
