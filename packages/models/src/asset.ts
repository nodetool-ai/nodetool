/**
 * Asset model – digital asset storage with folder hierarchy.
 *
 * Port of Python's `nodetool.models.asset`.
 */

import { eq, and, or, like, desc, isNull, lt, inArray } from "drizzle-orm";
import { isShortResourceId, isSystemEntityMetadata } from "@nodetool-ai/protocol";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getPortableDb, getDatabase } from "./db.js";
import { assets } from "./schema/assets.js";

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
    const condition = and(eq(table.id, this.id), eq(table.user_id, this.user_id),
      expectedMetadata ? eq(table.metadata, expectedMetadata) : isNull(table.metadata));
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

  override toRow(): AssetInsert & Record<string, unknown> {
    return {
      id: this.id, user_id: this.user_id, parent_id: this.parent_id,
      file_id: this.file_id, name: this.name, content_type: this.content_type,
      size: this.size, duration: this.duration,
      metadata: this.metadata === null ? null : JSON.parse(JSON.stringify(this.metadata)),
      sketch_document_id: this.sketch_document_id, workflow_id: this.workflow_id,
      node_id: this.node_id, job_id: this.job_id, timeline_id: this.timeline_id,
      project_id: this.project_id, external_path: this.external_path,
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
        conditions.push(
          or(eq(assets.parent_id, parentId), isNull(assets.parent_id))!
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
