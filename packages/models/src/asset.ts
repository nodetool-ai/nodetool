/**
 * Asset model – digital asset storage with folder hierarchy.
 *
 * Port of Python's `nodetool.models.asset`.
 */

import { eq, and, like, desc, isNull } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { assets } from "./schema/assets.js";

export class Asset extends DBModel {
  static override table = assets;

  declare id: string;
  declare user_id: string;
  declare parent_id: string | null;
  declare file_id: string | null;
  declare name: string;
  declare content_type: string;
  declare size: number | null;
  declare duration: number | null;
  declare metadata: Record<string, unknown> | null;
  declare workflow_id: string | null;
  declare node_id: string | null;
  declare job_id: string | null;
  declare created_at: string;
  declare updated_at: string;

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
    this.workflow_id ??= null;
    this.node_id ??= null;
    this.job_id ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
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
    const asset = await Asset.get<Asset>(assetId);
    if (!asset || asset.user_id !== userId) return null;
    return asset;
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
      limit?: number;
    } = {}
  ): Promise<[Asset[], string]> {
    const {
      parentId,
      contentType,
      workflowId,
      nodeId,
      jobId,
      limit = 50
    } = opts;
    const db = getDb();

    const conditions = [eq(assets.user_id, userId)];
    if (parentId !== undefined) {
      if (parentId === null) {
        conditions.push(isNull(assets.parent_id));
      } else {
        conditions.push(eq(assets.parent_id, parentId));
      }
    }
    if (contentType) {
      conditions.push(eq(assets.content_type, contentType));
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

    const rows = db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.created_at))
      .limit(limit + 1)
      .all();

    const items = rows.map((r) => new Asset(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /** Get children of a folder. */
  static async getChildren(
    userId: string,
    parentId: string,
    limit = 100
  ): Promise<Asset[]> {
    const [assetList] = await Asset.paginate(userId, { parentId, limit });
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
      limit?: number;
    } = {}
  ): Promise<[Asset[], string, Array<Record<string, string>>]> {
    const { contentType, limit = 100 } = opts;
    // Escape LIKE special characters to prevent pattern injection
    const sanitized = query.trim().replace(/[%_\\]/g, "\\$&");
    const db = getDb();

    const conditions = [
      eq(assets.user_id, userId),
      like(assets.name, `%${sanitized}%`)
    ];
    if (contentType) {
      const sanitizedType = contentType.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(assets.content_type, `${sanitizedType}%`));
    }

    const rows = db
      .select()
      .from(assets)
      .where(and(...conditions))
      .limit(limit)
      .all();

    const items = rows.map((r) => new Asset(r as Record<string, unknown>));
    const cursor = "";

    const pathInfo = await Asset.getAssetPathInfo(
      userId,
      items.map((a) => a.id)
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
    for (const id of assetIds) {
      const asset = await Asset.find(userId, id);
      if (asset) assetMap.set(id, asset);
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

      while (currentId && currentId !== userId) {
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
    folderId: string
  ): Promise<{ assets: Record<string, unknown>[] }> {
    const folder = await Asset.find(userId, folderId);
    if (!folder) return { assets: [] };

    async function recursiveFetch(
      currentFolderId: string
    ): Promise<Record<string, unknown>[]> {
      const [assetList] = await Asset.paginate(userId, {
        parentId: currentFolderId,
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
