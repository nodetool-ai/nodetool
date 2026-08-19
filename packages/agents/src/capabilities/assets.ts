/**
 * The `assets` capability module — everything an agent does with stored media.
 *
 * Eight capabilities that used to be eight `Tool` subclasses spread over four
 * files: `list_assets` / `get_asset`, `save_asset` / `read_asset`,
 * `asset_search` / `asset_list`, and `list_images` / `view_image`. The
 * design's mapping table folds the library and image tools in here rather
 * than leaving them beside the file tools.
 *
 * Wire names, descriptions and schemas are unchanged. `view_image` keeps its
 * result shape to the byte: the executors strip `image_content` out of the
 * result and forward the pixels as provider image blocks (`image-injection.ts`),
 * so anything that reshapes it silently blinds the model.
 *
 * `list_images` and `view_image` are the two capabilities whose identity is a
 * Zod schema rather than a hand-written JSON one. Their `inputSchema` is
 * derived with `zodToJsonSchema`, and the validation `Tool.execute` used to run
 * before `process()` moves inside the implementation, returning the same
 * `invalid_tool_arguments` envelope. Their deprecated classes keep the Zod
 * schema on `schema`, so the class path validates exactly once, where it
 * always did.
 */

import { Buffer } from "node:buffer";
import { z, type ZodType } from "zod";
import {
  extractImageRegion,
  parseWithTypeCoercion,
  zodToJsonSchema,
  type ImageRegion,
  type JsonSchema,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import type { Asset as AssetRow } from "@nodetool-ai/models";
import { loadMediaRefBytes, safeFetch } from "@nodetool-ai/runtime";
import { mimeForPath } from "../sandbox-media-ref.js";
import { MIME_TO_EXT } from "../tools/asset-persist.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule
} from "./types.js";
import {
  listAssetsSpec,
  getAssetSpec,
  saveAssetSpec,
  readAssetSpec,
  assetSearchSpec,
  assetListSpec,
  listImagesSpec,
  viewImageSpec,
  updateAssetSpec,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  LIST_ASSETS_SCHEMA,
  SAVE_ASSET_SCHEMA,
  ASSET_SEARCH_SCHEMA,
  ASSET_LIST_SCHEMA,
  LIST_IMAGES_SCHEMA,
  REGION_SCHEMA,
  VIEW_IMAGE_SCHEMA
} from "./assets.specs.js";
import {
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  LIST_ASSETS_SCHEMA,
  SAVE_ASSET_SCHEMA,
  ASSET_SEARCH_SCHEMA,
  ASSET_LIST_SCHEMA,
  LIST_IMAGES_SCHEMA,
  REGION_SCHEMA,
  VIEW_IMAGE_SCHEMA
} from "./assets.specs.js";

// ---------------------------------------------------------------------------
// Shared projections
// ---------------------------------------------------------------------------

/**
 * An asset row as `list_assets` / `get_asset` report it. Deliberately metadata
 * only: the signed download URLs on the HTTP response come from the server's
 * storage adapter, and an agent that wants the bytes calls `read_asset`.
 */
function assetRecord(asset: AssetRow) {
  const ext = asset.fileExtension;
  return {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id ?? null,
    parent_id: asset.parent_id ?? null,
    name: asset.name,
    content_type: asset.content_type,
    // The canonical reference an agent can paste into a workflow property or
    // pass to media tools.
    uri: ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`,
    size: asset.size ?? null,
    duration: asset.duration ?? null,
    created_at: asset.created_at,
    metadata: asset.metadata ?? null
  };
}

/** Build the canonical `asset://<id>.<ext>` uri for an asset. */
function assetUri(asset: AssetRow): string {
  const ext = asset.fileExtension;
  return ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`;
}

/** The lightweight handle the library capabilities return — no bytes. */
function toHandle(asset: AssetRow) {
  const metadata = asset.metadata ?? {};
  return {
    asset_id: asset.id,
    name: asset.name,
    content_type: asset.content_type,
    uri: assetUri(asset),
    size: asset.size ?? null,
    duration: asset.duration ?? null,
    width: isNumber(metadata.width) ? metadata.width : null,
    height: isNumber(metadata.height) ? metadata.height : null,
    created_at: asset.created_at
  };
}

function resolveLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.min(Math.floor(n), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

/**
 * The argument check `Tool.execute` runs for a Zod-schema'd tool, moved to
 * where the implementation is. Same coercion, same failure envelope — a
 * capability reached through `invoke` must answer a bad call the way the tool
 * answered it.
 */
function withZodValidation(
  name: string,
  schema: ZodType,
  core: CapabilityImpl
): CapabilityImpl {
  return async (run, args) => {
    let parsed: unknown;
    try {
      parsed = parseWithTypeCoercion(schema, args);
    } catch (error) {
      const issues =
        error instanceof z.ZodError
          ? error.issues.map((issue) => {
              const path = issue.path.join(".");
              return path ? `${path}: ${issue.message}` : issue.message;
            })
          : [String(error)];
      return {
        error: "invalid_tool_arguments",
        message: `Invalid arguments for ${name}: ${issues.join("; ")}`,
        issues
      };
    }
    if (!isRecord(parsed)) {
      return {
        error: "invalid_tool_arguments",
        message: `Invalid arguments for ${name}: expected an object`,
        issues: ["expected an object"]
      };
    }
    return core(run, parsed as Record<string, unknown>);
  };
}

/** The paging/filter bag `Asset.paginate` and `searchAssetsGlobal` take. */
interface AssetQueryOptions {
  contentType?: string;
  limit: number;
}

/** What `read_asset` answers with when it found the bytes. */
interface ReadAssetResult {
  success: true;
  name: string;
  content: string;
  content_base64?: string;
  binary: boolean;
  uri: string | null;
  size: number;
}

/** The crop/downscale bag `extractImageRegion` takes. */
interface ImageExtractOptions {
  region?: ImageRegion;
  maxSide?: number;
  sourceMime?: string;
}

/** What `view_image` answers with once it has the image in hand. */
interface ViewImageResult {
  ok: true;
  image_id: string;
  mimeType: string | undefined;
  detail: "low" | "high";
  width?: number;
  height?: number;
  note: string;
  image_content: { uri: string | undefined; mimeType: string | undefined };
}

const listAssets: CapabilityExport = {
  spec: listAssetsSpec,
  impl: async (run, params) => {
    const source = String(params["source"] ?? "user");
    const query = params["query"] as string | undefined;
    const contentType = params["content_type"] as string | undefined;
    const limit = Number(params["limit"] ?? 100);
    const userId = userIdOf(run.context);

    // Package assets are files shipped with a node package, not database rows;
    // they stay on the REST route that serves them.
    if (source === "package") {
      // Package assets are files inside the installed node packages, served
      // by the server from its own install — there is no row to read.
      return run.listPackageAssets
        ? { assets: await run.listPackageAssets({ limit }), next: null }
        : {
            error:
              "Package assets are not available in this process — they are " +
              "read from the installed node packages by the server."
          };
    }

    const { Asset } = await import("@nodetool-ai/models");
    if (query) {
      const search: AssetQueryOptions = { limit };
      if (contentType) search.contentType = contentType;
      const [assets, next] = await Asset.searchAssetsGlobal(
        userId,
        query,
        search
      );
      return { assets: assets.map(assetRecord), next: next || null };
    }

    const page: AssetQueryOptions = { limit };
    if (contentType) page.contentType = contentType;
    const [assets, next] = await Asset.paginate(userId, page);
    return { assets: assets.map(assetRecord), next: next || null };
  }
};

// ---------------------------------------------------------------------------
// get_asset
// ---------------------------------------------------------------------------

const getAsset: CapabilityExport = {
  spec: getAssetSpec,
  impl: async (run, params) => {
    const { Asset } = await import("@nodetool-ai/models");
    const assetId = String(params["asset_id"]);
    const asset = await Asset.find(userIdOf(run.context), assetId);
    return asset
      ? assetRecord(asset)
      : { error: `Asset ${assetId} was not found.` };
  }
};

/** Largest file `save_asset` copies from a `source`, in bytes. */
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

/**
 * Read the bytes behind a `save_asset` source. An http(s) URL goes through
 * `safeFetch` (SSRF-screened, capped); everything else — a `/api/storage/`
 * key, an `asset://` URI, a data URI — is what `loadMediaRefBytes` already
 * resolves for `read_asset`, so the two agree on what a ref means.
 */
async function readSourceBytes(
  context: ProcessingContext,
  source: string
): Promise<
  { bytes: Uint8Array; contentType?: string } | { error: string }
> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await safeFetch(source);
    if (!response.ok) {
      return { error: `Fetching ${source} failed with HTTP ${response.status}.` };
    }
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      return {
        error: `${source} is ${declared} bytes, past the ${MAX_SOURCE_BYTES}-byte limit.`
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      return {
        error: `${source} is ${bytes.byteLength} bytes, past the ${MAX_SOURCE_BYTES}-byte limit.`
      };
    }
    const header = response.headers.get("content-type");
    const contentType = header?.split(";")[0]?.trim();
    return contentType
      ? { bytes, contentType }
      : { bytes };
  }
  let bytes: Uint8Array | null = null;
  try {
    bytes = await loadMediaRefBytes({ uri: source }, context);
  } catch {
    // Reported below as not found; the message names the forms that work.
  }
  if (!bytes) {
    return {
      error:
        `Source not found: ${source}. Pass the asset_url or /api/storage/ ` +
        `key a tool returned, an asset:// URI, or an http(s) URL.`
    };
  }
  return { bytes };
}

const saveAsset: CapabilityExport = {
  spec: saveAssetSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const name = params.name;
      const content = params.content;
      const contentBase64 = params.content_base64;
      const contentTypeArg = params.content_type;

      if (!isString(name) || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
      }
      const source = params.source;
      const hasText = isString(content);
      const hasBinary = isString(contentBase64) && contentBase64;
      const hasSource = isString(source) && source.trim() !== "";
      const supplied = [hasText, hasBinary, hasSource].filter(Boolean).length;
      if (supplied === 0) {
        return {
          success: false,
          error:
            "One of `content` (text), `content_base64` (binary) or `source` " +
            "(an asset_url, /api/storage/ key, asset:// URI or http(s) URL " +
            "to copy) is required"
        };
      }
      if (supplied > 1) {
        return {
          success: false,
          error:
            "`content`, `content_base64` and `source` are mutually exclusive"
        };
      }

      let data: Uint8Array;
      let mime: string;
      if (hasSource) {
        // The bytes already exist somewhere the host can read — copy them
        // here instead of having the caller read them to base64 and pass
        // them back, which is what a model does when this path is missing.
        const fetched = await readSourceBytes(context, source.trim());
        if ("error" in fetched) {
          return { success: false, error: fetched.error };
        }
        data = fetched.bytes;
        mime =
          isString(contentTypeArg) && contentTypeArg
            ? contentTypeArg
            : (fetched.contentType ??
              mimeForPath(source) ??
              "application/octet-stream");
      } else {
        data = hasBinary
          ? new Uint8Array(Buffer.from(contentBase64, "base64"))
          : new TextEncoder().encode(content as string);
        mime =
          isString(contentTypeArg) && contentTypeArg
            ? contentTypeArg
            : hasBinary
              ? "application/octet-stream"
              : "text/plain";
      }

      // Prefer the model interface (DB + storage). This is what the chat
      // UI surfaces in the asset browser and what other tools can reference
      // by `asset://<id>.<ext>` URIs.
      // The interface, not the method — see `persistOutput`. Without this
      // the storage-adapter fallback below was dead code and a run with no
      // asset persistence answered with an error instead of using it.
      if (context.hasModelInterface?.("createAsset")) {
        const asset = (await context.createAsset({
          name,
          contentType: mime,
          content: data
        })) as { id?: string };
        if (asset && isString(asset.id)) {
          // createAsset persists under a DB-generated id, so a name-keyed
          // read_asset("<name>") would never find it. Mirror the bytes under
          // the `assets/<name>` storage key too (best-effort) so the reader's
          // name-based lookup resolves what this tool saved.
          if (context.storage) {
            try {
              await context.storage.store(`assets/${name}`, data, mime);
            } catch {
              // Non-fatal: the asset is still saved via createAsset.
            }
          }
          const ext = MIME_TO_EXT[mime];
          const assetUri = ext
            ? `asset://${asset.id}.${ext}`
            : `asset://${asset.id}`;
          return {
            success: true,
            name,
            asset_id: asset.id,
            asset_uri: assetUri,
            url: assetUri,
            content_type: mime,
            size: data.byteLength
          };
        }
      }

      // Fallback: write to the storage adapter directly.
      if (!context.storage) {
        return {
          success: false,
          error:
            "No storage adapter or createAsset interface available — cannot persist asset"
        };
      }
      const key = `assets/${name}`;
      const uri = await context.storage.store(key, data, mime);
      return {
        success: true,
        name,
        uri,
        content_type: mime,
        size: data.byteLength
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

// ---------------------------------------------------------------------------
// read_asset
// ---------------------------------------------------------------------------

const readAsset: CapabilityExport = {
  spec: readAssetSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const name = params.name;

      if (!isString(name) || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
      }

      let data: Uint8Array | null = null;
      let matchedUri: string | null = null;

      // The legacy shape: a bare file name stored under `assets/<name>`. Tried
      // first so a name that means a storage key keeps meaning one.
      const looksLikeUri = name.includes("://") || name.startsWith("/api/");
      if (!looksLikeUri && context.storage) {
        const key = `assets/${name}`;
        for (const uri of [`memory://${key}`, `file://${key}`, `s3://${key}`]) {
          const result = await context.storage.retrieve(uri);
          if (result) {
            data = result;
            matchedUri = uri;
            break;
          }
        }
      }

      // Everything an agent actually holds: the `asset://<id>` URI a
      // generation returns (with or without an extension), the bare id off
      // `asset_id`, a `/api/storage/` key, a `package://` URI, a data URI.
      // `loadMediaRefBytes` is the one resolver that knows all of them, so
      // this tool and `read_media_bytes` cannot disagree about what a ref means.
      if (!data) {
        // A bare name is tried as an asset id in canonical form:
        // `loadMediaRefBytes` reads `asset_id` only when there is no uri, so
        // handing it both a raw name and the id would resolve neither.
        const ref = looksLikeUri
          ? { uri: name }
          : { uri: `asset://${name}`, asset_id: name };
        try {
          data = await loadMediaRefBytes(ref, context);
          if (data) matchedUri = name;
        } catch {
          // A context without an asset resolver or storage cannot answer this
          // form. That is "not found" for the caller, not a different failure
          // to report — the message below names the forms that do work.
        }
      }

      if (!data) {
        return {
          success: false,
          error:
            `Asset not found: ${name}. Pass the asset:// URI a generation ` +
            `returned (its asset_uri), the asset_id itself, or a ` +
            `/api/storage/ key — and use list_assets or asset_search to find ` +
            `one. For a workspace file use read_file instead.`
        };
      }

      // Decode as UTF-8 only when the bytes actually are UTF-8. TextDecoder
      // with fatal:false would silently turn binary (PNG, audio, msgpack) into
      // U+FFFD garbage and still report success; for non-text bytes return
      // base64 the caller can round-trip instead.
      let content: string;
      let contentBase64: string | undefined;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        contentBase64 = Buffer.from(data).toString("base64");
        content = "";
      }

      const result: ReadAssetResult = {
        success: true,
        name,
        content,
        binary: contentBase64 !== undefined,
        uri: matchedUri,
        size: data.byteLength
      };
      if (contentBase64 !== undefined) result.content_base64 = contentBase64;
      return result;
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

const assetSearch: CapabilityExport = {
  spec: assetSearchSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) {
      return {
        success: false,
        error: "No user context; cannot search assets."
      };
    }

    const query = isString(params.query) ? params.query.trim() : "";
    const contentType =
      isString(params.content_type) && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      const { Asset } = await import("@nodetool-ai/models");
      const search: AssetQueryOptions = { limit };
      if (contentType) search.contentType = contentType;
      const [rows] = await Asset.searchAssetsGlobal(userId, query, search);
      const assets = rows
        .filter((a) => a.content_type !== "folder")
        .map((a) => toHandle(a));
      return { success: true, count: assets.length, assets };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

const assetList: CapabilityExport = {
  spec: assetListSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) {
      return { success: false, error: "No user context; cannot list assets." };
    }

    const contentType =
      isString(params.content_type) && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      // `searchAssetsGlobal` with an empty query orders by created_at DESC and
      // supports a content_type prefix — exactly a "recent assets" listing.
      const { Asset } = await import("@nodetool-ai/models");
      const recent: AssetQueryOptions = { limit };
      if (contentType) recent.contentType = contentType;
      const [rows] = await Asset.searchAssetsGlobal(userId, "", recent);
      const assets = rows
        .filter((a) => a.content_type !== "folder")
        .map((a) => toHandle(a));
      return { success: true, count: assets.length, assets };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

const DEFAULT_LIST_LIMIT = 25;

/** `list_images` without the argument check — what the deprecated class runs. */
export const listImagesCore: CapabilityImpl = async (run, params) => {
  const userId = run.context.userId;
  if (!userId) {
    return { error: "No user context; cannot list assets." };
  }
  const limitParam = Number(params["limit"]);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), 100)
      : DEFAULT_LIST_LIMIT;
  const query =
    isString(params["query"]) ? params["query"].trim() : "";

  try {
    // searchAssetsGlobal does a content_type prefix match, so "image/"
    // returns the whole image family; an empty query matches all names.
    const { Asset } = await import("@nodetool-ai/models");
    const [rows] = await Asset.searchAssetsGlobal(userId, query, {
      contentType: "image/",
      limit
    });

    const images = rows
      .filter(
        (a) =>
          isString(a.content_type) &&
          a.content_type.startsWith("image/")
      )
      .slice(0, limit)
      .map((a) => {
        const metadata = a.metadata ?? {};
        return {
          image_id: a.id,
          name: a.name,
          content_type: a.content_type,
          size: a.size ?? null,
          width:
            isNumber(metadata["width"]) ? metadata["width"] : null,
          height:
            isNumber(metadata["height"]) ? metadata["height"] : null
        };
      });

    return {
      images,
      count: images.length,
      hint: "Call view_image({ image_id }) to load the pixels of one."
    };
  } catch (e) {
    return {
      error: `Could not list image assets: ${e instanceof Error ? e.message : String(e)}`
    };
  }
};

const listImages: CapabilityExport = {
  spec: listImagesSpec,
  impl: withZodValidation("list_images", LIST_IMAGES_SCHEMA, listImagesCore)
};

// ---------------------------------------------------------------------------
// view_image
// ---------------------------------------------------------------------------

/** Sniff the mime type of encoded image bytes by magic number. */
function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
      return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
      return "image/gif";
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
      return "image/webp";
  }
  return "image/png";
}

/** Parse a `data:<mime>;base64,<payload>` URI into bytes + mime. */
function parseDataUri(
  uri: string
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const bytes = isBase64
    ? new Uint8Array(Buffer.from(payload, "base64"))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { bytes, mimeType };
}

const LOW_DETAIL_MAX_SIDE = 768;

function parseRegion(value: unknown): ImageRegion | undefined {
  if (!isObjectLike(value)) return undefined;
  const r = value as Record<string, unknown>;
  const x = Number(r["x"]);
  const y = Number(r["y"]);
  const width = Number(r["width"]);
  const height = Number(r["height"]);
  if (
    ![x, y, width, height].every((n) => Number.isFinite(n)) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

/** `view_image` without the argument check — what the deprecated class runs. */
export const viewImageCore: CapabilityImpl = async (run, params) => {
  const context = run.context;
  const imageId = String(params["image_id"] ?? "").trim();
  if (!imageId) {
    return { error: "image_id is required" };
  }

  const region = parseRegion(params["region"]);
  const detail = params["detail"] === "low" ? "low" : "high";
  const maxSide = detail === "low" ? LOW_DETAIL_MAX_SIDE : undefined;

  // Resolve the source to bytes when we can (so region/detail actually apply);
  // fall back to letting the provider fetch a remote URL.
  let sourceBytes: Uint8Array | null = null;
  let sourceMime = "image/png";
  let passthroughUri: string | undefined;

  if (imageId.startsWith("data:")) {
    const parsed = parseDataUri(imageId);
    if (!parsed) return { error: "Malformed data: URI for image_id" };
    sourceBytes = parsed.bytes;
    sourceMime = parsed.mimeType;
  } else if (/^https?:\/\//i.test(imageId)) {
    passthroughUri = imageId;
  } else {
    try {
      const { bytes } = await context.resolveAssetBytes(imageId);
      if (bytes && bytes.length > 0) {
        sourceBytes = bytes;
        sourceMime = sniffImageMime(bytes);
      }
    } catch {
      // fall through to the not-found error below
    }
  }

  if (!sourceBytes && !passthroughUri) {
    return {
      error: `Could not load image "${imageId}". Pass an asset id, asset:// URI, http(s) URL, or data: URI.`
    };
  }

  let outUri = passthroughUri;
  let outMime = sourceMime;
  let width = 0;
  let height = 0;
  const notes: string[] = [];

  if (sourceBytes) {
    // Vision providers only accept these formats; anything else must be
    // re-encoded to PNG before it can be shown to the model.
    const PROVIDER_SAFE_MIMES = new Set([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp"
    ]);
    const needsTransform =
      Boolean(region) ||
      maxSide !== undefined ||
      !PROVIDER_SAFE_MIMES.has(sourceMime);
    if (!needsTransform) {
      // No crop or downscale requested and the source is a provider-safe
      // format: ship the original bytes unchanged. Re-encoding a
      // well-compressed source through the codec can bloat it many-fold (a
      // 44KB screenshot PNG re-encoded to >1MB), wasting tokens for no gain.
      outUri = `data:${sourceMime};base64,${Buffer.from(sourceBytes).toString("base64")}`;
      outMime = sourceMime;
    } else {
      try {
        const extract: ImageExtractOptions = { sourceMime };
        if (region) extract.region = region;
        if (maxSide) extract.maxSide = maxSide;
        const prepared = await extractImageRegion(sourceBytes, extract);
        // width/height 0 signals the no-sharp pass-through: the bytes were
        // NOT re-encoded, so keep the true source mime rather than a
        // fabricated one (mislabeling makes the provider reject the image).
        outMime =
          prepared.width === 0 && prepared.height === 0
            ? sourceMime
            : prepared.mimeType;
        outUri = `data:${outMime};base64,${Buffer.from(prepared.data).toString("base64")}`;
        width = prepared.width;
        height = prepared.height;
      } catch (e) {
        // Codec failed unexpectedly: ship the original bytes uncropped.
        outUri = `data:${sourceMime};base64,${Buffer.from(sourceBytes).toString("base64")}`;
        notes.push(
          `Could not crop/resize (${e instanceof Error ? e.message : String(e)}); showing full image.`
        );
      }
    }
  } else if (region) {
    notes.push(
      "Region crop is not applied to remote URLs; showing the full image."
    );
  }

  const question =
    isString(params["question"]) ? params["question"].trim() : "";
  const dims = width && height ? ` (${width}×${height})` : "";
  const regionNote = region
    ? ` region ${region.x},${region.y} ${region.width}×${region.height}`
    : "";
  const note =
    question ||
    `Image ${imageId}${regionNote}${dims}:` +
      (notes.length ? ` ${notes.join(" ")}` : "");

  const result: ViewImageResult = {
    ok: true,
    image_id: imageId,
    mimeType: outMime,
    detail,
    note,
    image_content: { uri: outUri, mimeType: outMime }
  };
  if (width) result.width = width;
  if (height) result.height = height;
  return result;
};

const viewImage: CapabilityExport = {
  spec: viewImageSpec,
  impl: withZodValidation("view_image", VIEW_IMAGE_SCHEMA, viewImageCore)
};

/** Every asset capability, in the order `getAllMcpTools` offered them. */
/**
 * Rename or re-file one of the caller's own assets.
 *
 * Deliberately narrow. `Asset.find` is user-scoped, so another user's asset
 * reads as missing; a move goes through `Asset.validateParent`, the same rule
 * the tRPC route applies, so a run cannot detach a subtree by moving a folder
 * under its own descendant. Content type is not settable: the stored file name
 * is derived from it, so changing it without re-uploading the bytes would
 * leave the asset pointing at a file nobody wrote.
 */
const updateAsset: CapabilityExport = {
  spec: updateAssetSpec,
  impl: async (run, params) => {
    const { Asset } = await import("@nodetool-ai/models");
    const userId = userIdOf(run.context);
    const assetId = String(params["asset_id"]);
    const asset = await Asset.find(userId, assetId);
    if (!asset) return { error: `Asset ${assetId} was not found.` };

    let touched = false;
    if (isString(params["name"]) && params["name"]) {
      asset.name = params["name"];
      touched = true;
    }
    if (isString(params["parent_id"]) && params["parent_id"]) {
      const problem = await Asset.validateParent(
        userId,
        asset,
        params["parent_id"]
      );
      if (problem) return { error: problem };
      asset.parent_id = params["parent_id"];
      touched = true;
    }
    if (!touched) {
      return { error: "Nothing to update — pass name or parent_id." };
    }

    await asset.save();
    return assetRecord(asset);
  }
};

export const ASSET_CAPABILITIES: readonly CapabilityExport[] = [
  listAssets,
  getAsset,
  saveAsset,
  readAsset,
  assetSearch,
  assetList,
  listImages,
  viewImage,
  updateAsset
];

export const module: CapabilityModule = {
  module: "assets",
  exports: ASSET_CAPABILITIES
};

export {
  listAssets,
  getAsset,
  saveAsset,
  readAsset,
  assetSearch,
  assetList,
  listImages,
  viewImage,
  updateAsset
};
