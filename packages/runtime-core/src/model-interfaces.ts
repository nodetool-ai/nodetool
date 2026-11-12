/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- These types moved here unchanged from packages/runtime/src/context.ts. Narrowing their unknowns is a modelling change for the persistence port. */
/**
 * The persistence port a node context forwards to. The host installs these
 * functions, and the context binds `userId` from the run.
 */
import type { Entity, EntityKind, EntitySource } from "@nodetool-ai/protocol";

export interface MessageCreateRequestLike {
  thread_id: string;
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  workflow_id?: string | null;
  name?: string | null;
  tool_call_id?: string | null;
}

export interface ThreadMessagesResultLike {
  messages: Array<Record<string, unknown>>;
  next: string | null;
}

export interface AssetCreateParamsLike {
  userId: string;
  workflowId: string | null;
  jobId: string;
  projectId?: string | null;
  name: string;
  contentType: string;
  content: Uint8Array;
  parentId?: string | null;
  nodeId?: string | null;
  /** Stored on the asset row; the generation seam stamps `generation_id`. */
  metadata?: Record<string, unknown> | null;
}

/** A non-folder asset surfaced when listing a folder's contents. */
export interface FolderAssetEntry {
  id: string;
  content_type: string;
  name: string;
}

/** An asset's identity + metadata, as surfaced by `getAssetInfo`. */
export interface AssetInfoEntry {
  id: string;
  content_type: string;
  name: string;
  metadata: Record<string, unknown> | null;
}

/**
 * A record the host's persistence layer answers with.
 *
 * The row and response types live in `@nodetool-ai/models`, which sits above
 * `runtime`, so the port names the field every caller reads — the record's
 * identity — and each caller re-reads the document fields it knows how to
 * interpret.
 */
export interface PersistedRecordLike {
  id: string;
}

export interface ProcessingContextModelInterfaces {
  /** Read a non-secret setting owned by the current user. */
  getSetting?: (args: {
    userId: string;
    key: string;
  }) => Promise<string | null>;
  getJob?: (args: {
    userId: string;
    jobId: string;
  }) => Promise<PersistedRecordLike | null>;
  /**
   * HOLDOUT (anti-slop/no-unknown-returns): narrowing this to the created
   * record's shape breaks the `as Record<string, unknown>` assertions on the
   * result in `image-nodes` and `audio-nodes` — an interface without an index
   * signature is not comparable to that type. Typing it honestly means editing
   * those call sites too.
   */
  createAsset?: (args: AssetCreateParamsLike) => Promise<unknown>;
  /**
   * Replace an existing asset's bytes in place, keeping its id. Returns `null`
   * when the asset does not exist or is not owned by the user.
   *
   * An editing loop needs this: creating a new asset per save would give the
   * caller a different id after every edit, and the handles it already handed
   * out would point at a stale version.
   */
  updateAssetBytes?: (args: {
    userId: string;
    assetId: string;
    content: Uint8Array;
    contentType?: string;
    name?: string;
  }) => Promise<AssetInfoEntry | null>;
  /**
   * Recursively list the non-folder assets contained in `folderId`. Returns
   * `null` when the id is not a folder (or does not exist) so callers can tell
   * "not a folder" apart from "empty folder" (`[]`).
   */
  listFolderAssets?: (args: {
    userId: string;
    folderId: string;
  }) => Promise<FolderAssetEntry[] | null>;
  /**
   * Look up one owned asset's identity + metadata (no bytes). Returns `null`
   * when the asset does not exist or is not owned by the user.
   */
  getAssetInfo?: (args: {
    userId: string;
    assetId: string;
  }) => Promise<AssetInfoEntry | null>;
  createMessage?: (args: {
    userId: string;
    req: MessageCreateRequestLike;
  }) => Promise<PersistedRecordLike>;
  getMessages?: (args: {
    userId: string;
    threadId: string;
    limit?: number;
    startKey?: string | null;
    reverse?: boolean;
  }) => Promise<ThreadMessagesResultLike>;
  /** Load a persisted sketch (image document) by id; null when missing or not owned. */
  getImageDocument?: (args: {
    userId: string;
    id: string;
  }) => Promise<PersistedRecordLike | null>;
  /** Create a persisted sketch (image document); returns the created document response. */
  createImageDocument?: (args: {
    userId: string;
    name: string;
    projectId?: string;
    width: number;
    height: number;
    document: unknown;
  }) => Promise<PersistedRecordLike>;
  /** Load a persisted timeline sequence by id; null when missing or not owned. */
  getTimelineSequence?: (args: {
    userId: string;
    id: string;
  }) => Promise<PersistedRecordLike | null>;
  /** Create a persisted timeline sequence from a full sequence document. */
  createTimelineSequence?: (args: {
    userId: string;
    sequence: unknown;
  }) => Promise<PersistedRecordLike>;
  /** Replace a persisted timeline sequence's document; null when missing or not owned. */
  updateTimelineSequence?: (args: {
    userId: string;
    id: string;
    sequence: unknown;
  }) => Promise<PersistedRecordLike | null>;
  /** Load a persisted script by id; null when missing or not owned. */
  getScript?: (args: {
    userId: string;
    id: string;
  }) => Promise<PersistedRecordLike | null>;
  /** Create a persisted script from a name + document. */
  createScript?: (args: {
    userId: string;
    name?: string;
    projectId?: string;
    document: unknown;
  }) => Promise<PersistedRecordLike>;
  /** Replace a persisted script's document (and optional timeline link); null when missing or not owned. */
  updateScript?: (args: {
    userId: string;
    id: string;
    document?: unknown;
    timelineId?: string | null;
    baseUpdatedAt?: string;
  }) => Promise<PersistedRecordLike | null>;
  /** Load a persisted storyboard by id; null when missing or not owned. */
  getStoryboard?: (args: {
    userId: string;
    id: string;
  }) => Promise<PersistedRecordLike | null>;
  /** The caller's storyboards, optionally narrowed by project. */
  listStoryboards?: (args: {
    userId: string;
    projectId?: string;
    limit?: number;
  }) => Promise<PersistedRecordLike[]>;
  /**
   * The copy a previous run derived from `templateId` for that `recastKey`;
   * null when there is none. Scoped rather than listed, because a listing is
   * windowed and a batch bigger than the window would keep re-deriving — and
   * re-rendering — copies it already has.
   */
  findRecastStoryboard?: (args: {
    userId: string;
    projectId?: string;
    templateId: string;
    recastKey: string;
  }) => Promise<PersistedRecordLike | null>;
  /** Create a persisted storyboard from a name + document. */
  createStoryboard?: (args: {
    userId: string;
    name?: string;
    projectId?: string;
    document: unknown;
  }) => Promise<PersistedRecordLike>;
  /** Replace a persisted storyboard's document (and optional timeline link); null when missing or not owned. */
  updateStoryboard?: (args: {
    userId: string;
    id: string;
    document?: unknown;
    timelineId?: string | null;
    baseUpdatedAt?: string;
  }) => Promise<PersistedRecordLike | null>;
  /** The caller's entity library, optionally narrowed by project, kind, tags or name. */
  listEntities?: (args: {
    userId: string;
    projectId?: string;
    kind?: EntityKind;
    tags?: string[];
    nameContains?: string;
    limit?: number;
  }) => Promise<Entity[]>;
  /** Read one owned entity by id; null when missing, not owned, or not tagged. */
  getEntity?: (args: { userId: string; id: string }) => Promise<Entity | null>;
  /**
   * Create or update one entity, identified by `source.key` when given and by
   * (project, kind, name) otherwise. A re-run of the same graph therefore
   * updates the entity it made last time instead of growing the library.
   */
  upsertEntity?: (args: EntityUpsertArgs) => Promise<EntityUpsertResult>;
}

/** The arguments {@link ProcessingContextModelInterfaces.upsertEntity} takes. */
export interface EntityUpsertArgs {
  userId: string;
  projectId?: string;
  kind: EntityKind;
  name: string;
  descriptor: string;
  /** The image asset the entity shows; also the row a new entity is tagged on. */
  imageAssetId: string;
  description?: string;
  tags?: string[];
  voiceId?: string | null;
  /** Stored verbatim on the marker, so a re-run finds its own row. */
  source?: EntitySource;
}

/**
 * What an upsert did. The host owns the match rule (`source.key`, then
 * project/kind/name), so it is the only place that can say whether the row is
 * new — a caller re-deriving that from a probe duplicates the rule and drifts
 * from it the moment the host's changes.
 */
export interface EntityUpsertResult {
  entity: Entity;
  created: boolean;
}

/**
 * The arguments one model interface takes, minus the `userId` every context
 * forwarder binds from the run. Derived so the shape is declared once, on the
 * interface.
 */
export type ModelInterfaceArgs<K extends keyof ProcessingContextModelInterfaces> =
  Omit<
    Parameters<NonNullable<ProcessingContextModelInterfaces[K]>>[0],
    "userId"
  >;
