/**
 * Asset model – digital asset storage with folder hierarchy.
 *
 * Port of Python's `nodetool.models.asset`.
 */

import { isDeepStrictEqual } from "node:util";
import { eq, and, or, like, desc, isNull, isNotNull, lt, ne, not, inArray, sql, count } from "drizzle-orm";
import {
  PROJECT_DIRECTORY_ID_PREFIX,
  WORKSPACE_MOVE_TARGET_KEY,
  isShortResourceId,
  isSystemEntityMetadata
} from "@nodetool-ai/protocol";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getPortableDb, getDatabase } from "./db.js";
import { assets } from "./schema/assets.js";

/** What an asset row says about where its bytes are. */
export interface AssetFilePlacement {
  workspace_path: string | null;
  metadata: Record<string, unknown> | null;
}

export type AssetRow = typeof assets.$inferSelect;
export type AssetInsert = typeof assets.$inferInsert;

export class Asset extends DBModel {
  static override table = assets;

  declare id: AssetRow["id"];
  declare user_id: AssetRow["user_id"];
  declare parent_id: AssetRow["parent_id"];
  declare file_id: AssetRow["file_id"];
  declare name: AssetRow["name"];
  declare content_type: AssetRow["content_type"];
  declare size: AssetRow["size"];
  declare duration: AssetRow["duration"];
  declare metadata: AssetRow["metadata"];
  /** Sketch document that backs this image asset, if any (1:1 link). */
  declare sketch_document_id: AssetRow["sketch_document_id"];
  declare workflow_id: AssetRow["workflow_id"];
  declare node_id: AssetRow["node_id"];
  declare job_id: AssetRow["job_id"];
  declare timeline_id: AssetRow["timeline_id"];
  /**
   * The project this asset belongs to, `"default"` for none — the same loose
   * bucket every document table spells that way. Read per project only for
   * entities, the assets carrying the entity marker.
   */
  declare project_id: AssetRow["project_id"];
  /**
   * Absolute path of a file referenced in place (local mode only). Bytes are
   * read from this path, never copied under the storage root, and deleting
   * the asset leaves the file alone. Null for every managed asset.
   */
  declare external_path: AssetRow["external_path"];
  /**
   * Path of this asset's file, relative to the folder of its project. Null
   * for an asset whose bytes live at `external_path` or under the legacy
   * storage key.
   */
  declare workspace_path: AssetRow["workspace_path"];
  /**
   * SHA-256 of the whole file at `workspace_path`, in hex. Null until the
   * background hash job has read the file, and again from the moment the
   * file's fingerprint changes.
   */
  declare content_hash: AssetRow["content_hash"];
  /** The user starred this asset; the asset browser lists these as Favorites. */
  declare favorite: AssetRow["favorite"];
  declare created_at: AssetRow["created_at"];
  declare updated_at: AssetRow["updated_at"];

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= "";
    this.content_type ??= "application/octet-stream";
    this.parent_id ??= null;
    this.file_id ??= null;
    this.size ??= null;
    this.duration ??= null;
    this.metadata ??= null;
    this.sketch_document_id ??= null;
    this.workflow_id ??= null;
    this.node_id ??= null;
    this.job_id ??= null;
    this.timeline_id ??= null;
    this.project_id ??= "default";
    this.external_path ??= null;
    this.workspace_path ??= null;
    this.content_hash ??= null;
    this.favorite = Boolean(this.favorite);
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  /** Save only while the persisted metadata still matches the caller's read. */
  async saveIfMetadataMatches(
    expectedMetadata: Record<string, unknown> | null
  ): Promise<boolean> {
    this.beforeSave();
    const connection = getDatabase();
    const table = connection.schema.assets;
    const owner = and(eq(table.id, this.id), eq(table.user_id, this.user_id));
    const current = connection.dialect === "sqlite"
      ? await connection.db.select({ metadata: connection.schema.assets.metadata })
        .from(connection.schema.assets).where(owner).limit(1)
      : await connection.db.select({ metadata: connection.schema.assets.metadata })
        .from(connection.schema.assets).where(owner).limit(1);
    if (!current[0] || !isDeepStrictEqual(current[0].metadata, expectedMetadata)) {
      return false;
    }
    // Guard with the stored key order so an intervening write still loses the CAS.
    const stored = current[0].metadata;
    const condition = and(owner,
      stored === null ? isNull(table.metadata) : eq(table.metadata, stored));
    const row = this.toRow();
    const updated = connection.dialect === "sqlite"
      ? await connection.db.update(connection.schema.assets).set(row)
        .where(condition).returning({ id: connection.schema.assets.id })
      : await connection.db.update(connection.schema.assets).set(row)
        .where(condition).returning({ id: connection.schema.assets.id });
    if (updated.length === 0) {
      return false;
    }
    ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return true;
  }

  /**
   * Record `contentHash` as the SHA-256 of this asset's file, but only while
   * the persisted metadata still matches `expectedMetadata`. The metadata
   * holds the file's fingerprint, so a hash computed from a file that changed
   * while it was read is never stored. Only `content_hash` is written: the
   * row's other columns and `updated_at` stay as they are, and no change
   * event is sent, because no client reads the hash.
   */
  async recordContentHash(
    contentHash: string,
    expectedMetadata: Record<string, unknown> | null
  ): Promise<boolean> {
    const connection = getDatabase();
    const table = connection.schema.assets;
    const owner = and(eq(table.id, this.id), eq(table.user_id, this.user_id));
    const current = connection.dialect === "sqlite"
      ? await connection.db.select({ metadata: connection.schema.assets.metadata })
        .from(connection.schema.assets).where(owner).limit(1)
      : await connection.db.select({ metadata: connection.schema.assets.metadata })
        .from(connection.schema.assets).where(owner).limit(1);
    if (!current[0] || !isDeepStrictEqual(current[0].metadata, expectedMetadata)) {
      return false;
    }
    // Guard with the stored key order so an intervening write still loses the CAS.
    const stored = current[0].metadata;
    const condition = and(owner,
      stored === null ? isNull(table.metadata) : eq(table.metadata, stored));
    const updated = connection.dialect === "sqlite"
      ? await connection.db.update(connection.schema.assets)
        .set({ content_hash: contentHash })
        .where(condition).returning({ id: connection.schema.assets.id })
      : await connection.db.update(connection.schema.assets)
        .set({ content_hash: contentHash })
        .where(condition).returning({ id: connection.schema.assets.id });
    if (updated.length === 0) return false;
    this.content_hash = contentHash;
    return true;
  }

  /**
   * Write where this asset's bytes are, but only while the persisted row
   * still holds `expected`, has no `external_path`, and belongs to the same
   * project. Only `workspace_path`, `parent_id`, `size`, `content_hash` and
   * `metadata` are written, so a change another writer made to any other
   * column stays. `updated_at` is left alone: it versions the asset's URL,
   * and the bytes are the ones the asset had.
   *
   * False when the row is gone or no longer what the caller read. Nothing is
   * written then.
   */
  async saveFilePlacementIf(expected: AssetFilePlacement): Promise<boolean> {
    const saved = await this.updateIfPlaced(expected, {
      workspace_path: this.workspace_path,
      parent_id: this.parent_id,
      size: this.size,
      content_hash: this.content_hash,
      metadata: this.storedMetadata()
    });
    if (saved) ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return saved;
  }

  /**
   * Write `metadata` alone, under the conditions of
   * {@link saveFilePlacementIf}. No change event is sent: it records a step of
   * the move of the asset's bytes, which no client reads.
   */
  saveMoveStateIf(expected: AssetFilePlacement): Promise<boolean> {
    return this.updateIfPlaced(expected, { metadata: this.storedMetadata() });
  }

  /**
   * The metadata key that marks a row from before project folders whose
   * bytes are under no asset store key. Its value is the row's `updated_at`
   * when it was written. See {@link markLegacyBytesMissing}.
   */
  static readonly LEGACY_BYTES_MISSING_KEY = "legacy_bytes_missing";

  /**
   * Record that the move into the project folder found no object under any
   * legacy key of this row, through {@link saveMoveStateIf} with the row as
   * read and no file. The row then leaves {@link listAwaitingFolderMove} and
   * {@link countAwaitingFolderMove}, so the migration can finish. It comes
   * back when the row is saved again, which changes `updated_at`, such as by
   * a bytes update, or when {@link clearMissingBytesMarkers} runs. False when
   * the row changed since it was read. Nothing is written then.
   */
  async markLegacyBytesMissing(): Promise<boolean> {
    const read = this.metadata;
    this.metadata = {
      ...(read ?? {}),
      [Asset.LEGACY_BYTES_MISSING_KEY]: this.updated_at
    };
    const saved = await this.saveMoveStateIf({
      workspace_path: null,
      metadata: read
    });
    if (!saved) this.metadata = read;
    return saved;
  }

  /**
   * The rows of the user in `projectId` that {@link markLegacyBytesMissing}
   * marked and that were not saved since: the rows its mark leaves out of
   * {@link listAwaitingFolderMove}. Oldest first.
   */
  static async listLegacyBytesMissing(
    userId: string,
    projectId: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          isNull(assets.workspace_path),
          isNull(assets.external_path),
          legacyBytesMissing()
        )
      )
      .orderBy(assets.created_at, assets.id);
    return rows.map((row) => new Asset(row));
  }

  /**
   * Remove the mark {@link markLegacyBytesMissing} wrote from every row of
   * the user, so the next move pass looks for their bytes again. Only the
   * metadata is written, and only while it is what was read. `updated_at`
   * stays. Returns how many rows were cleared.
   */
  static async clearMissingBytesMarkers(userId: string): Promise<number> {
    const db = getPortableDb();
    const owner = eq(assets.user_id, userId);
    const rows = await db
      .select({ id: assets.id, metadata: assets.metadata })
      .from(assets)
      .where(and(owner, carriesMissingBytesKey()));
    let cleared = 0;
    for (const row of rows) {
      const stored = row.metadata;
      if (!stored || !Object.hasOwn(stored, Asset.LEGACY_BYTES_MISSING_KEY)) {
        continue;
      }
      const metadata = Object.fromEntries(
        Object.entries(stored).filter(
          ([key]) => key !== Asset.LEGACY_BYTES_MISSING_KEY
        )
      );
      const updated = await db
        .update(assets)
        .set({ metadata })
        .where(and(eq(assets.id, row.id), owner, eq(assets.metadata, stored)))
        .returning({ id: assets.id });
      cleared += updated.length;
    }
    return cleared;
  }

  /**
   * Record the size of a client-direct upload, but only while its bytes are
   * still under its storage key: no file in a project folder, no external
   * file and no move under way. Only `size` and `updated_at` are written.
   * False when the row is gone or the mover took it. Nothing is written then.
   */
  async saveUploadSizeIf(size: number): Promise<boolean> {
    const updatedAt = new Date().toISOString();
    const updated = await getPortableDb()
      .update(assets)
      .set({ size, updated_at: updatedAt })
      .where(and(eq(assets.id, this.id), eq(assets.user_id, this.user_id), bytesUnderKey()))
      .returning({ id: assets.id });
    if (updated.length === 0) return false;
    this.size = size;
    this.updated_at = updatedAt;
    ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return true;
  }

  /**
   * Delete the row of a client-direct upload that was never finalized: no
   * size yet, and its bytes, if any, still under its storage key. False when
   * the row is gone or no longer pending. Nothing is deleted then.
   */
  async deleteIfPendingUpload(): Promise<boolean> {
    const deleted = await getPortableDb()
      .delete(assets)
      .where(
        and(
          eq(assets.id, this.id),
          eq(assets.user_id, this.user_id),
          isNull(assets.size),
          bytesUnderKey()
        )
      )
      .returning({ id: assets.id });
    if (deleted.length === 0) return false;
    ModelObserver.notify(this, ModelChangeEvent.DELETED);
    return true;
  }

  private storedMetadata(): Record<string, unknown> | null {
    return this.metadata === null
      ? null
      : JSON.parse(JSON.stringify(this.metadata));
  }

  private async updateIfPlaced(
    expected: AssetFilePlacement,
    values: Partial<
      Pick<
        AssetInsert,
        "workspace_path" | "parent_id" | "size" | "content_hash" | "metadata"
      >
    >
  ): Promise<boolean> {
    const db = getPortableDb();
    const owner = and(eq(assets.id, this.id), eq(assets.user_id, this.user_id));
    const current = await db
      .select({
        metadata: assets.metadata,
        workspace_path: assets.workspace_path
      })
      .from(assets)
      .where(owner)
      .limit(1);
    if (
      !current[0] ||
      current[0].workspace_path !== expected.workspace_path ||
      !isDeepStrictEqual(current[0].metadata, expected.metadata)
    ) {
      return false;
    }
    // Guard with the stored key order so an intervening write still loses the CAS.
    const stored = current[0].metadata;
    const updated = await db
      .update(assets)
      .set(values)
      .where(
        and(
          owner,
          eq(assets.project_id, this.project_id),
          isNull(assets.external_path),
          expected.workspace_path === null
            ? isNull(assets.workspace_path)
            : eq(assets.workspace_path, expected.workspace_path),
          stored === null ? isNull(assets.metadata) : eq(assets.metadata, stored)
        )
      )
      .returning({ id: assets.id });
    return updated.length > 0;
  }

  override toRow(): AssetInsert & Record<string, unknown> {
    return {
      id: this.id, user_id: this.user_id, parent_id: this.parent_id,
      file_id: this.file_id, name: this.name, content_type: this.content_type,
      size: this.size, duration: this.duration,
      metadata: this.metadata === null ? null : JSON.parse(JSON.stringify(this.metadata)),
      sketch_document_id: this.sketch_document_id, workflow_id: this.workflow_id,
      node_id: this.node_id, job_id: this.job_id, timeline_id: this.timeline_id,
      project_id: this.project_id, external_path: this.external_path,
      workspace_path: this.workspace_path,
      content_hash: this.content_hash,
      favorite: this.favorite,
      created_at: this.created_at, updated_at: this.updated_at
    };
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Computed properties ──────────────────────────────────────────

  get isFolder(): boolean {
    return this.content_type === "folder";
  }

  get fileExtension(): string {
    const dot = this.name.lastIndexOf(".");
    return dot >= 0 ? this.name.slice(dot + 1).toLowerCase() : "";
  }

  get hasThumbnail(): boolean {
    const type = this.content_type;
    return type.startsWith("image/") || type.startsWith("video/");
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find an asset by id, scoped to the user. */
  static async find(userId: string, assetId: string): Promise<Asset | null> {
    const connection = getDatabase();
    const table = connection.schema.assets;
    const exactWhere = and(eq(table.user_id, userId), eq(table.id, assetId));
    const exactRows = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.assets).where(exactWhere).limit(1)
      : await connection.db.select().from(connection.schema.assets).where(exactWhere).limit(1);
    if (exactRows[0]) return new Asset(exactRows[0]);
    if (!isShortResourceId(assetId)) return null;
    const prefixWhere = and(eq(table.user_id, userId), like(table.id, `${assetId}%`));
    const matches = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.assets).where(prefixWhere).limit(2)
      : await connection.db.select().from(connection.schema.assets).where(prefixWhere).limit(2);
    if (matches.length > 1) {
      throw new Error(`short id "${assetId}" matches more than one row; use the full id`);
    }
    return matches[0] ? new Asset(matches[0]) : null;
  }

  /** Find multiple assets by id, scoped to the user. */
  static async findMany(userId: string, assetIds: string[]): Promise<Asset[]> {
    if (assetIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(assetIds));
    const db = getPortableDb();
    const results: Asset[] = [];

    const chunkSize = 900;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.user_id, userId), inArray(assets.id, chunk)));

      for (const r of rows) {
        results.push(new Asset(r));
      }
    }
    return results;
  }

  /** The user's assets that reference `externalPath` in place. */
  static async findByExternalPath(
    userId: string,
    externalPath: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(eq(assets.user_id, userId), eq(assets.external_path, externalPath))
      );
    return rows.map((row) => new Asset(row));
  }

  /**
   * The user's assets in `projectId` whose file is at `workspacePath`. More
   * than one row is an integrity error the caller must not add to.
   */
  static async findByWorkspacePath(
    userId: string,
    projectId: string,
    workspacePath: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          eq(assets.workspace_path, workspacePath)
        )
      );
    return rows.map((row) => new Asset(row));
  }

  /**
   * The user's linked assets in `projectId` (a row with `external_path`)
   * whose metadata holds a string under the top-level key `key`. Asset
   * services find the files an unfinished collect reserved this way.
   */
  static async findLinkedWithMetadataKey(
    userId: string,
    projectId: string,
    key: string
  ): Promise<Asset[]> {
    // Metadata is JSON text in both dialects. The pattern narrows the scan
    // to rows naming the key, and the parsed metadata decides.
    const marker = JSON.stringify(key).replace(/[\\%_]/g, "\\$&");
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          isNotNull(assets.external_path),
          sql`${assets.metadata} LIKE ${`%${marker}%`} ESCAPE '\\'`
        )
      );
    return rows
      .map((row) => new Asset(row))
      .filter((asset) => typeof asset.metadata?.[key] === "string");
  }

  /**
   * The user's assets in `projectId` whose metadata holds the string `value`
   * under the top-level key `key`, oldest first. Asset services find the
   * copies of an asset this way.
   */
  static async findByMetadataString(
    userId: string,
    projectId: string,
    key: string,
    value: string
  ): Promise<Asset[]> {
    // Metadata is stored as JSON text in both dialects. The pattern narrows
    // the scan to rows naming the value, and the parsed metadata decides.
    const marker = JSON.stringify({ [key]: value })
      .slice(1, -1)
      .replace(/[\\%_]/g, "\\$&");
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          sql`${assets.metadata} LIKE ${`%${marker}%`} ESCAPE '\\'`
        )
      )
      .orderBy(assets.created_at);
    return rows
      .map((row) => new Asset(row))
      .filter((asset) => asset.metadata?.[key] === value);
  }

  /**
   * Every asset of the user in `projectId` that keeps its file in the project
   * folder, in one query. The reconciler compares this list with the folder.
   */
  static async listProjectFiles(
    userId: string,
    projectId: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          isNotNull(assets.workspace_path)
        )
      );
    return rows.map((row) => new Asset(row));
  }

  /**
   * Create the row of a file in a project folder under an ID the caller
   * supplies, without ever rewriting a row that already exists.
   *
   * `save()` is an upsert and the primary key is install-global. An ID read
   * from a folder another machine wrote could therefore overwrite the asset
   * of another user or project. This inserts and answers null on conflict,
   * leaving the existing row untouched. The caller has created the project.
   */
  static async insertNew(data: {
    id: string;
    user_id: string;
    project_id: string;
    parent_id: string | null;
    name: string;
    content_type: string;
    workspace_path: string;
    size: number | null;
    metadata: Record<string, unknown> | null;
    content_hash: string | null;
  }): Promise<Asset | null> {
    const asset = new Asset(data);
    asset.beforeSave();
    const rows = await getPortableDb()
      .insert(assets)
      .values({
        id: asset.id,
        user_id: asset.user_id,
        parent_id: asset.parent_id,
        name: asset.name,
        content_type: asset.content_type,
        size: asset.size,
        metadata: asset.metadata,
        project_id: asset.project_id,
        workspace_path: asset.workspace_path,
        content_hash: asset.content_hash,
        created_at: asset.created_at,
        updated_at: asset.updated_at
      })
      .onConflictDoNothing()
      .returning();
    const row = rows[0];
    if (!row) return null;
    const created = new Asset(row);
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  /**
   * Point every row of the user in `projectId` whose file lies under the
   * directory `from` at the same file under `to`, in one statement. Returns
   * how many rows changed. Both paths are project-relative directories.
   */
  static async moveWorkspaceDirectory(
    userId: string,
    projectId: string,
    from: string,
    to: string
  ): Promise<number> {
    const prefix = `${from}/`;
    // substr and || mean the same on SQLite and PostgreSQL, and unlike LIKE
    // they compare case-sensitively with no escaping of `_` and `%`.
    const rows = await getPortableDb()
      .update(assets)
      .set({
        workspace_path: sql`${`${to}/`} || substr(${assets.workspace_path}, CAST(${prefix.length + 1} AS INTEGER))`,
        updated_at: new Date().toISOString()
      })
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          sql`substr(${assets.workspace_path}, 1, CAST(${prefix.length} AS INTEGER)) = ${prefix}`
        )
      )
      .returning({ id: assets.id });
    return rows.length;
  }

  /**
   * The rows of the user in `projectId` whose bytes are not in the project
   * folder yet, or whose move there is not finished: a row with no
   * `workspace_path` and no `external_path` that is not a folder, and any row
   * that still carries {@link WORKSPACE_MOVE_TARGET_KEY}. A row
   * {@link markLegacyBytesMissing} marked is left out until it is saved again
   * or the mark is cleared. Oldest first.
   */
  static async listAwaitingFolderMove(
    userId: string,
    projectId: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          awaitingFolderMove()
        )
      )
      .orderBy(assets.created_at, assets.id);
    return rows
      .map((row) => new Asset(row))
      .filter((asset) => !asset.workspace_path || moveTargetOf(asset) !== null);
  }

  /**
   * Every user and project that has a row {@link listAwaitingFolderMove}
   * returns. Deliberately not user-scoped, for the startup job, so it must
   * never back a request handler.
   */
  static async listProjectsAwaitingFolderMove(userId?: string): Promise<
    { userId: string; projectId: string }[]
  > {
    const rows = await getPortableDb()
      .selectDistinct({
        userId: assets.user_id,
        projectId: assets.project_id
      })
      .from(assets)
      .where(
        and(
          awaitingFolderMove(),
          userId === undefined ? undefined : eq(assets.user_id, userId)
        )
      );
    return rows;
  }

  /**
   * How many rows of the user, in any project or none, still wait for their
   * bytes to move into a project folder: the rows
   * {@link listAwaitingFolderMove} returns, summed over every project.
   */
  static async countAwaitingFolderMove(userId: string): Promise<number> {
    const db = getPortableDb();
    const owner = and(eq(assets.user_id, userId), awaitingFolderMove());
    // A row with no file always counts. Clients poll this during the
    // migration, so those rows are counted, not read.
    const [withoutFile] = await db
      .select({ n: count() })
      .from(assets)
      .where(and(owner, isNull(assets.workspace_path)));
    // A row with a file counts only while its move is not finished. The
    // metadata match is textual, so those few rows are checked after the read.
    const withFile = await db
      .select()
      .from(assets)
      .where(and(owner, isNotNull(assets.workspace_path)));
    return (
      Number(withoutFile?.n ?? 0) +
      withFile
        .map((row) => new Asset(row))
        .filter((asset) => !asset.workspace_path || moveTargetOf(asset) !== null)
        .length
    );
  }

  /**
   * The rows of the user in `projectId` whose bytes are on their way to
   * `workspacePath` and have no file in the folder yet. The file at that path
   * is theirs, so nothing else may take it for a new asset.
   */
  static async findMovingTo(
    userId: string,
    projectId: string,
    workspacePath?: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.user_id, userId),
          eq(assets.project_id, projectId),
          isNull(assets.workspace_path),
          carriesMoveTarget()
        )
      );
    return rows
      .map((row) => new Asset(row))
      .filter((asset) => {
        const target = moveTargetOf(asset);
        return (
          target !== null &&
          (workspacePath === undefined || target === workspacePath)
        );
      });
  }

  /** How many rows of the user name `parentId` as their parent. */
  static async countChildren(userId: string, parentId: string): Promise<number> {
    const rows = await getPortableDb()
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.user_id, userId), eq(assets.parent_id, parentId)))
      .limit(1);
    return rows.length;
  }

  /** Every folder row of the user, from every project. */
  static async listFolders(userId: string): Promise<Asset[]> {
    const rows = await getPortableDb()
      .select()
      .from(assets)
      .where(and(eq(assets.user_id, userId), eq(assets.content_type, "folder")));
    return rows.map((row) => new Asset(row));
  }

  /**
   * Every asset across all users, oldest first — for offline maintenance
   * (the storage key backfill). Deliberately not user-scoped, so it must
   * never back a request handler; pass `userId` to narrow it.
   */
  static async allForMigration(userId?: string): Promise<Asset[]> {
    const db = getPortableDb();
    const query = db.select().from(assets);
    const rows = await (userId
      ? query.where(eq(assets.user_id, userId))
      : query);
    return rows.map((row) => new Asset(row));
  }

  /**
   * Why `parentId` may not become this asset's parent, or null when it may.
   *
   * A message rather than a throw: the models layer has no HTTP error
   * vocabulary, and the two callers want different shapes — the tRPC route
   * raises INVALID_INPUT, the sandbox capability returns `{error}`. Sharing
   * the *rule* is what matters, because the rule is what keeps the tree a
   * tree: without the ancestor walk, moving a folder under its own descendant
   * detaches that whole subtree from Home, where nothing can reach it again.
   */
  static async validateParent(
    userId: string,
    asset: Asset,
    parentId: string
  ): Promise<string | null> {
    // The synthetic "Home" folder is the user id itself and has no row.
    if (parentId === userId) return null;
    if (parentId === asset.id) return "An asset cannot be its own parent";

    const parent = await Asset.find(userId, parentId);
    if (!parent) return "Parent folder not found";
    // A short id resolves to the asset itself without equalling its id.
    if (parent.id === asset.id) return "An asset cannot be its own parent";
    if (parent.content_type !== "folder") return "Parent must be a folder";

    // Walk up from the new parent: reaching the asset means the move would put
    // it under one of its own descendants.
    const seen = new Set<string>([parentId]);
    let currentId: string | null = parent.parent_id ?? null;
    while (currentId && currentId !== userId) {
      if (currentId === asset.id) {
        return "Cannot move an asset into one of its own descendants";
      }
      if (seen.has(currentId)) break; // pre-existing cycle; nothing more to learn
      seen.add(currentId);
      const ancestor: Asset | null = await Asset.find(userId, currentId);
      if (!ancestor) break;
      currentId = ancestor.parent_id ?? null;
    }
    return null;
  }

  /**
   * Why this asset may not be written or deleted by its owner, or null when it
   * may.
   *
   * Shipped style presets are seeded into every library as ordinary asset rows
   * carrying a `system` entity marker. They are read-only (PRD § 7.7.9): a
   * preset's descriptor must mean the same thing on every board, and a user who
   * wants a variant takes a copy through `Add your own style`. The rule lives
   * here, next to `validateParent`, because more than one surface writes assets
   * — the tRPC route and the sandbox's entity capability — and a rule enforced
   * on one of them is not enforced.
   */
  static systemEntityRefusal(asset: Asset): string | null {
    return isSystemEntityMetadata(asset.metadata)
      ? `"${asset.name || asset.id}" is a shipped style preset and cannot be changed. Use "Add your own style" to make an editable copy.`
      : null;
  }

  /** List assets in a folder. */
  static async paginate(
    userId: string,
    opts: {
      parentId?: string | null;
      contentType?: string;
      workflowId?: string;
      nodeId?: string;
      jobId?: string;
      timelineId?: string;
      projectId?: string;
      /** Only starred assets, from every folder. */
      favorite?: boolean;
      limit?: number;
      startKey?: string;
    } = {}
  ): Promise<[Asset[], string]> {
    const {
      parentId,
      contentType,
      workflowId,
      nodeId,
      jobId,
      timelineId,
      projectId,
      favorite,
      limit = 50,
      startKey
    } = opts;
    const db = getPortableDb();

    const conditions = [eq(assets.user_id, userId)];
    if (parentId !== undefined) {
      if (parentId === null) {
        conditions.push(isNull(assets.parent_id));
      } else if (parentId === userId) {
        // Home. A row with no parent lives here too — that is what
        // `getFolderInfo` reports for it, and what the asset browser has to
        // show or the asset is unreachable. Server-side writers (chat media
        // generation, the generate-media RPC, workflow node outputs) filed
        // their assets with a null parent, so an exact match on the home id
        // hid every one of them from the browser.
        // A row filed in a directory of a project folder has a directory id
        // as its parent. Only a project's listing reads directories, so
        // every other listing shows such a row at Home too.
        conditions.push(
          or(
            eq(assets.parent_id, parentId),
            isNull(assets.parent_id),
            sql`substr(${assets.parent_id}, 1, ${PROJECT_DIRECTORY_ID_PREFIX.length}) = ${PROJECT_DIRECTORY_ID_PREFIX}`
          )!
        );
      } else {
        conditions.push(eq(assets.parent_id, parentId));
      }
    }
    if (contentType) {
      // Prefix match, like searchAssetsGlobal: a "image" filter must find
      // "image/png". Exact equality only matched legacy bare-type rows.
      const sanitizedType = contentType.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(assets.content_type, `${sanitizedType}%`));
    }
    if (workflowId) {
      conditions.push(eq(assets.workflow_id, workflowId));
    }
    if (nodeId) {
      conditions.push(eq(assets.node_id, nodeId));
    }
    if (jobId) {
      conditions.push(eq(assets.job_id, jobId));
    }
    if (projectId) {
      conditions.push(eq(assets.project_id, projectId));
    }
    if (favorite) {
      conditions.push(eq(assets.favorite, true));
    }
    if (startKey) {
      const cursor = await Asset.get<Asset>(startKey);
      if (cursor && cursor.user_id === userId) {
        conditions.push(lt(assets.created_at, cursor.created_at));
      }
    }
    if (timelineId) {
      conditions.push(eq(assets.timeline_id, timelineId));
    }

    const rows = await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.created_at))
      .limit(limit + 1);

    const items = rows.map((row) => new Asset(row));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  static async listByProject(
    userId: string,
    projectId: string
  ): Promise<Asset[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.user_id, userId), eq(assets.project_id, projectId)));
    return rows.map((row) => new Asset(row));
  }

  /** All saved outputs for one node and job, newest first. */
  static async listByJobNode(
    userId: string,
    workflowId: string,
    nodeId: string,
    jobId: string
  ): Promise<Asset[]> {
    const rows = await getPortableDb().select().from(assets).where(and(
      eq(assets.user_id, userId), eq(assets.workflow_id, workflowId),
      eq(assets.node_id, nodeId), eq(assets.job_id, jobId)
    )).orderBy(desc(assets.created_at));
    return rows.map((row) => new Asset(row));
  }

  /** Get children of a folder. */
  static async getChildren(
    userId: string,
    parentId: string,
    limit = 100,
    projectId?: string
  ): Promise<Asset[]> {
    const [assetList] = await Asset.paginate(userId, {
      parentId,
      projectId,
      limit
    });
    return assetList;
  }

  /**
   * Search assets globally across all folders for a user.
   * Uses LIKE on name field for substring matching.
   */
  static async searchAssetsGlobal(
    userId: string,
    query: string,
    opts: {
      contentType?: string;
      projectId?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<[Asset[], string, Array<Record<string, string>>]> {
    const { contentType, projectId, limit = 100, cursor: startKey } = opts;
    // Escape LIKE special characters to prevent pattern injection
    const sanitized = query.trim().replace(/[%_\\]/g, "\\$&");
    const db = getPortableDb();

    const conditions = [
      eq(assets.user_id, userId),
      like(assets.name, `%${sanitized}%`)
    ];
    if (contentType) {
      const sanitizedType = contentType.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(assets.content_type, `${sanitizedType}%`));
    }
    if (projectId) {
      conditions.push(eq(assets.project_id, projectId));
    }
    if (startKey) {
      const cursorAsset = await Asset.get<Asset>(startKey);
      if (cursorAsset && cursorAsset.user_id === userId) {
        conditions.push(lt(assets.created_at, cursorAsset.created_at));
      }
    }

    const rows = await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.created_at))
      .limit(limit + 1);

    const items = rows.map((row) => new Asset(row));
    let cursor = "";
    if (items.length > limit) {
      items.pop();
      cursor = items[items.length - 1]?.id ?? "";
    }

    const pathInfo = await Asset.getAssetPathInfo(
      userId,
      items.map((asset) => asset.id)
    );

    const folderPaths: Array<Record<string, string>> = [];
    for (const asset of items) {
      if (pathInfo[asset.id]) {
        folderPaths.push(pathInfo[asset.id]);
      } else {
        folderPaths.push({
          folder_name: "Unknown",
          folder_path: "Unknown",
          folder_id: asset.parent_id ?? ""
        });
      }
    }

    return [items, cursor, folderPaths];
  }

  /**
   * Get folder path information for given asset IDs.
   */
  static async getAssetPathInfo(
    userId: string,
    assetIds: string[]
  ): Promise<Record<string, Record<string, string>>> {
    if (assetIds.length === 0) return {};

    const result: Record<string, Record<string, string>> = {};

    const assetMap = new Map<string, Asset>();

    // Chunk ids to avoid sqlite limitations on max parameters if array is huge
    const chunkSize = 900;
    for (let i = 0; i < assetIds.length; i += chunkSize) {
      const chunk = assetIds.slice(i, i + chunkSize);
      const db = getPortableDb();
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.user_id, userId), inArray(assets.id, chunk)));

      for (const r of rows) {
        assetMap.set(r.id, new Asset(r));
      }
    }

    const parentCache = new Map<string, Asset>();

    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) continue;

      if (!asset.parent_id || asset.parent_id === userId) {
        result[assetId] = {
          folder_name: "Home",
          folder_path: "Home",
          folder_id: userId
        };
        continue;
      }

      const pathParts: string[] = [];
      const pathIds: string[] = [];
      let currentId: string | null = asset.parent_id;
      // A cyclic parent chain would loop here forever. better-sqlite3 is
      // synchronous, so the awaits never yield to the macrotask queue and the
      // whole process wedges rather than just this request.
      const seenAncestors = new Set<string>();

      while (currentId && currentId !== userId) {
        if (seenAncestors.has(currentId)) break;
        seenAncestors.add(currentId);
        let parent = parentCache.get(currentId);
        if (!parent) {
          parent = (await Asset.find(userId, currentId)) ?? undefined;
          if (parent) parentCache.set(currentId, parent);
        }
        if (!parent) break;
        pathParts.push(parent.name);
        pathIds.push(parent.id);
        currentId = parent.parent_id;
      }

      pathParts.push("Home");
      pathIds.push(userId);
      pathParts.reverse();
      pathIds.reverse();

      const immediateName = pathParts[pathParts.length - 1];
      const immediateId = pathIds[pathIds.length - 1];

      result[assetId] = {
        folder_name: immediateName,
        folder_path: pathParts.join(" / "),
        folder_id: immediateId
      };
    }

    return result;
  }

  /**
   * Recursively fetch all assets within a folder.
   */
  static async getAssetsRecursive(
    userId: string,
    folderId: string,
    projectId?: string
  ): Promise<{ assets: Record<string, unknown>[] }> {
    const folder = await Asset.find(userId, folderId);
    if (
      !folder ||
      (projectId !== undefined && folder.project_id !== projectId)
    ) {
      return { assets: [] };
    }

    // Guards against cyclic parent links: without it the descent never
    // terminates, and since better-sqlite3 is synchronous it starves the
    // event loop instead of overflowing the stack.
    const visited = new Set<string>();

    async function recursiveFetch(
      currentFolderId: string
    ): Promise<Record<string, unknown>[]> {
      if (visited.has(currentFolderId)) return [];
      visited.add(currentFolderId);
      const [assetList] = await Asset.paginate(userId, {
        parentId: currentFolderId,
        projectId,
        limit: 10000
      });
      const result: Record<string, unknown>[] = [];
      for (const asset of assetList) {
        const dict = asset.toRow();
        if (asset.content_type === "folder") {
          dict.children = await recursiveFetch(asset.id);
        }
        result.push(dict);
      }
      return result;
    }

    const folderDict = folder.toRow();
    folderDict.children = await recursiveFetch(folderId);

    return { assets: [folderDict] };
  }
}

/** The path {@link WORKSPACE_MOVE_TARGET_KEY} records on `asset`, or null. */
export function moveTargetOf(asset: {
  metadata: Record<string, unknown> | null;
}): string | null {
  const target = asset.metadata?.[WORKSPACE_MOVE_TARGET_KEY];
  return typeof target === "string" && target !== "" ? target : null;
}

/** Rows whose stored metadata names {@link WORKSPACE_MOVE_TARGET_KEY}. */
function carriesMoveTarget() {
  // The metadata column is JSON text on both dialects, so the key is found
  // as text. A value that merely holds the word is filtered out after the read.
  return sql`${assets.metadata} LIKE ${`%"${WORKSPACE_MOVE_TARGET_KEY}"%`}`;
}

/** Rows whose bytes are under the storage key, with no move under way. */
function bytesUnderKey() {
  return and(
    isNull(assets.workspace_path),
    isNull(assets.external_path),
    or(isNull(assets.metadata), not(carriesMoveTarget()))
  );
}

/** Rows whose stored metadata names `Asset.LEGACY_BYTES_MISSING_KEY`. */
function carriesMissingBytesKey() {
  return sql`${assets.metadata} LIKE ${`%"${Asset.LEGACY_BYTES_MISSING_KEY}"%`}`;
}

/**
 * Rows that `Asset.markLegacyBytesMissing` marked and that were not saved
 * since. The mark holds `updated_at`, and JSON text puts it right after the
 * key, so the match is exact: a string value cannot hold an unescaped quote.
 */
function legacyBytesMissing() {
  const key = `%"${Asset.LEGACY_BYTES_MISSING_KEY}":"`;
  return sql`(${assets.metadata} LIKE (${key} || ${assets.updated_at} || ${'"%'}))`;
}

/**
 * Rows with bytes outside their project folder, or a move not finished,
 * except those whose bytes the move found under no key since their last save.
 */
function awaitingFolderMove() {
  return and(
    or(
      and(
        isNull(assets.workspace_path),
        isNull(assets.external_path),
        ne(assets.content_type, "folder")
      ),
      carriesMoveTarget()
    ),
    or(isNull(assets.metadata), not(legacyBytesMissing()))
  );
}

/** A file move that waits for its asset row. */
export interface AssetFileMove {
  /** Remove the file at its old place. Call after the row is saved. */
  commit(): Promise<void>;
  /** Remove the copy and restore the asset's fields. Call when it was not. */
  undo(): Promise<void>;
}

/**
 * Moves the file of an asset into the folder of another project and sets
 * `project_id` and `workspace_path` on the asset to match.
 */
export type AssetFileMover = (
  asset: Asset,
  projectId: string
) => Promise<AssetFileMove>;

let assetFileMover: AssetFileMover | null = null;

/**
 * Install what moves an asset's file between project folders. Folders are
 * reached through `@nodetool-ai/asset-services`, which depends on this
 * package, so it installs its mover here when it loads.
 */
export function setAssetFileMover(mover: AssetFileMover | null): void {
  assetFileMover = mover;
}

/**
 * Save `asset` as a member of `projectId`. Every change of an asset's project
 * goes through here.
 *
 * `workspace_path` is relative to the folder of `project_id`. Changing the
 * project alone would leave the file behind and point the row at whatever has
 * the same path in the other folder. So an asset that is a file in its
 * project folder has the file copied into the new folder first, under a name
 * nothing there uses, then the row is saved with both fields, and only then
 * is the old file removed.
 *
 * Throws when the file cannot be moved: no mover is installed on this host,
 * a folder is unreachable, or the file is missing. The asset is then left in
 * its project.
 */
export async function saveAssetInProject(
  asset: Asset,
  projectId: string
): Promise<void> {
  if (!asset.workspace_path || asset.project_id === projectId) {
    asset.project_id = projectId;
    await asset.save();
    return;
  }
  if (!assetFileMover) {
    throw new Error(
      `Asset ${asset.id} is a file in its project folder and cannot change ` +
        `project on this host: no asset file mover is installed`
    );
  }
  const move = await assetFileMover(asset, projectId);
  try {
    await asset.save();
  } catch (error) {
    await move.undo();
    throw error;
  }
  await move.commit();
}
