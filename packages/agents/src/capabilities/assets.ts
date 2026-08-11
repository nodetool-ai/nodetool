/**
 * The `assets` capability module — everything an agent does with stored media.
 *
 * Eight capabilities that used to be eight `Tool` subclasses spread over three
 * files: `list_assets` / `get_asset` (`../tools/mcp-tools.ts`), `save_asset` /
 * `read_asset` (`../tools/asset-tools.ts`), `asset_search` / `asset_list`
 * (`../tools/asset-library-tools.ts`), and `list_images` / `view_image`
 * (`../tools/view-image-tool.ts`). The design's mapping table folds the
 * library and image tools in here rather than leaving them beside the file
 * tools.
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
  type JsonSchema
} from "@nodetool-ai/runtime";
import type { Asset as AssetRow } from "@nodetool-ai/models";
import { userIdOf } from "../tools/mcp-tool-support.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule
} from "./types.js";

// ---------------------------------------------------------------------------
// Shared projections
// ---------------------------------------------------------------------------

/**
 * An asset row as `list_assets` / `get_asset` report it. Deliberately metadata
 * only: the signed download URLs on the HTTP response come from the server's
 * storage adapter, and an agent that wants the bytes calls `read_asset`.
 */
function assetRecord(asset: AssetRow): Record<string, unknown> {
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
function toHandle(asset: AssetRow): Record<string, unknown> {
  const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
  return {
    asset_id: asset.id,
    name: asset.name,
    content_type: asset.content_type,
    uri: assetUri(asset),
    size: asset.size ?? null,
    duration: asset.duration ?? null,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
    created_at: asset.created_at
  };
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        error: "invalid_tool_arguments",
        message: `Invalid arguments for ${name}: expected an object`,
        issues: ["expected an object"]
      };
    }
    return core(run, parsed as Record<string, unknown>);
  };
}

// ---------------------------------------------------------------------------
// list_assets
// ---------------------------------------------------------------------------

const LIST_ASSETS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    source: {
      type: "string",
      enum: ["user", "package"],
      default: "user"
    },
    query: {
      type: "string",
      description: "Search query for asset names (min 2 chars)"
    },
    content_type: {
      type: "string",
      description: "Filter by content type (image, video, audio, text, folder)"
    },
    limit: {
      type: "number",
      description: "Maximum number of assets to return",
      default: 100
    }
  },
  required: [] as string[]
};

const listAssets: CapabilityExport = {
  spec: {
    name: "list_assets",
    description: "List or search assets with flexible filtering options.",
    inputSchema: LIST_ASSETS_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const query = params["query"];
      return query ? `Searching assets for '${query}'` : "Listing assets";
    }
  },
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
      const [assets, next] = await Asset.searchAssetsGlobal(userId, query, {
        ...(contentType ? { contentType } : {}),
        limit
      });
      return { assets: assets.map(assetRecord), next: next || null };
    }

    const [assets, next] = await Asset.paginate(userId, {
      ...(contentType ? { contentType } : {}),
      limit
    });
    return { assets: assets.map(assetRecord), next: next || null };
  }
};

// ---------------------------------------------------------------------------
// get_asset
// ---------------------------------------------------------------------------

const getAsset: CapabilityExport = {
  spec: {
    name: "get_asset",
    description: "Get detailed information about a specific asset.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: {
          type: "string",
          description: "The ID of the asset"
        }
      },
      required: ["asset_id"]
    },
    category: "read",
    userMessage: (params) => `Getting asset ${params["asset_id"]}`
  },
  impl: async (run, params) => {
    const { Asset } = await import("@nodetool-ai/models");
    const assetId = String(params["asset_id"]);
    const asset = await Asset.find(userIdOf(run.context), assetId);
    return asset
      ? assetRecord(asset)
      : { error: `Asset ${assetId} was not found.` };
  }
};

// ---------------------------------------------------------------------------
// save_asset
// ---------------------------------------------------------------------------

const SAVE_ASSET_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description:
        "Display name of the asset (e.g. 'summary.md', 'report.json', 'cover.png')."
    },
    content: {
      type: "string",
      description:
        "Text content. Use this for text/markdown/JSON. Mutually exclusive with content_base64."
    },
    content_base64: {
      type: "string",
      description:
        "Binary content as a base64 string. Use this for images/audio/video bytes returned by other tools."
    },
    content_type: {
      type: "string",
      description:
        "MIME type (e.g. 'text/markdown', 'application/json', 'image/png'). Defaults to text/plain for text and application/octet-stream for binary."
    }
  },
  required: ["name"] as string[]
};

const saveAsset: CapabilityExport = {
  spec: {
    name: "save_asset",
    description:
      "Save content as an asset. Use this for any artifact you want to surface in the chat (text reports, JSON, manifests, images, audio). Pass `content_base64` for binary data and `content` for text. Returns an asset_id and asset:// URI you can reference in later steps.",
    inputSchema: SAVE_ASSET_SCHEMA,
    category: "write",
    userMessage: (params) => {
      const name = params.name;
      if (typeof name === "string" && name) {
        const msg = `Saving asset as ${name}...`;
        return msg.length > 80 ? "Saving asset..." : msg;
      }
      return "Saving asset...";
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    try {
      const name = params.name;
      const content = params.content;
      const contentBase64 = params.content_base64;
      const contentTypeArg = params.content_type;

      if (typeof name !== "string" || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
      }
      const hasText = typeof content === "string";
      const hasBinary = typeof contentBase64 === "string" && contentBase64;
      if (!hasText && !hasBinary) {
        return {
          success: false,
          error:
            "Either `content` (text) or `content_base64` (binary) is required"
        };
      }

      const data = hasBinary
        ? new Uint8Array(Buffer.from(contentBase64 as string, "base64"))
        : new TextEncoder().encode(content as string);
      const mime =
        typeof contentTypeArg === "string" && contentTypeArg
          ? contentTypeArg
          : hasBinary
            ? "application/octet-stream"
            : "text/plain";

      // Prefer the model interface (DB + storage). This is what the chat
      // UI surfaces in the asset browser and what other tools can reference
      // by `asset://<id>.<ext>` URIs.
      if (typeof context.createAsset === "function") {
        const asset = (await context.createAsset({
          name,
          contentType: mime,
          content: data
        })) as { id?: string };
        if (asset && typeof asset.id === "string") {
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
          return {
            success: true,
            name,
            asset_id: asset.id,
            asset_uri: `asset://${asset.id}`,
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
  spec: {
    name: "read_asset",
    description: "Read an asset file",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the asset file to read"
        }
      },
      required: ["name"] as string[]
    },
    category: "read",
    userMessage: (params) => {
      const name = params.name;
      if (typeof name === "string" && name) {
        const msg = `Reading asset ${name}...`;
        return msg.length > 80 ? "Reading an asset..." : msg;
      }
      return "Reading an asset...";
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    try {
      const name = params.name;

      if (typeof name !== "string" || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
      }

      if (!context.storage) {
        return { success: false, error: "No storage adapter configured" };
      }

      const key = `assets/${name}`;

      // Try the URI schemes the storage adapter might have used to store it.
      const schemes = [`memory://${key}`, `file://${key}`, `s3://${key}`];

      let data: Uint8Array | null = null;
      let matchedUri: string | null = null;

      for (const uri of schemes) {
        const result = await context.storage.retrieve(uri);
        if (result) {
          data = result;
          matchedUri = uri;
          break;
        }
      }

      if (!data) {
        return {
          success: false,
          error: `Asset not found: ${name}`
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

      return {
        success: true,
        name,
        content,
        ...(contentBase64 !== undefined
          ? { content_base64: contentBase64 }
          : {}),
        binary: contentBase64 !== undefined,
        uri: matchedUri,
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
// asset_search
// ---------------------------------------------------------------------------

const ASSET_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Name substring to match. Empty matches everything (recent first)."
    },
    content_type: {
      type: "string",
      description:
        "Optional MIME prefix filter (e.g. 'image/', 'video/', 'audio/', 'application/pdf')."
    },
    limit: {
      type: "number",
      description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    }
  },
  required: [] as string[]
};

const assetSearch: CapabilityExport = {
  spec: {
    name: "asset_search",
    description:
      "Search the user's assets by name (case-insensitive substring), across " +
      "every media type, so you can find and reuse something already generated " +
      "or uploaded — a rendered video, a generated image, an audio clip. " +
      "Returns lightweight handles with asset:// uris. Filter by content_type " +
      "prefix (e.g. 'image/', 'video/', 'audio/').",
    inputSchema: ASSET_SEARCH_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const q = typeof params.query === "string" ? params.query : "";
      return q ? `Searching assets: ${q.slice(0, 50)}` : "Searching assets";
    }
  },
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) {
      return { success: false, error: "No user context; cannot search assets." };
    }

    const query = typeof params.query === "string" ? params.query.trim() : "";
    const contentType =
      typeof params.content_type === "string" && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      const { Asset } = await import("@nodetool-ai/models");
      const [rows] = await Asset.searchAssetsGlobal(userId, query, {
        ...(contentType ? { contentType } : {}),
        limit
      });
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

// ---------------------------------------------------------------------------
// asset_list
// ---------------------------------------------------------------------------

const ASSET_LIST_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    content_type: {
      type: "string",
      description:
        "Optional MIME prefix filter (e.g. 'image/', 'video/', 'audio/'). " +
        "Omit to list every type."
    },
    limit: {
      type: "number",
      description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    }
  },
  required: [] as string[]
};

const assetList: CapabilityExport = {
  spec: {
    name: "asset_list",
    description:
      "List the user's most recent assets (newest first) so you can see and " +
      "reuse what has already been generated or uploaded. Filter by content_type " +
      "prefix (e.g. 'video/' for rendered videos). Returns handles with asset:// uris.",
    inputSchema: ASSET_LIST_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const ct =
        typeof params.content_type === "string" ? params.content_type : "";
      return ct ? `Listing ${ct} assets` : "Listing recent assets";
    }
  },
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) {
      return { success: false, error: "No user context; cannot list assets." };
    }

    const contentType =
      typeof params.content_type === "string" && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      // `searchAssetsGlobal` with an empty query orders by created_at DESC and
      // supports a content_type prefix — exactly a "recent assets" listing.
      const { Asset } = await import("@nodetool-ai/models");
      const [rows] = await Asset.searchAssetsGlobal(userId, "", {
        ...(contentType ? { contentType } : {}),
        limit
      });
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

// ---------------------------------------------------------------------------
// list_images
// ---------------------------------------------------------------------------

/** The Zod identity of `list_images`. The deprecated class keeps it on `schema`. */
export const LIST_IMAGES_SCHEMA = z
  .object({
    query: z
      .string()
      .optional()
      .describe("Filter image names by substring (case-insensitive)."),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe("Max handles to return (default 25).")
  })
  .loose();

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
    typeof params["query"] === "string" ? params["query"].trim() : "";

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
          typeof a.content_type === "string" &&
          a.content_type.startsWith("image/")
      )
      .slice(0, limit)
      .map((a) => {
        const metadata = (a.metadata ?? {}) as Record<string, unknown>;
        return {
          image_id: a.id,
          name: a.name,
          content_type: a.content_type,
          size: a.size ?? null,
          width: typeof metadata["width"] === "number" ? metadata["width"] : null,
          height:
            typeof metadata["height"] === "number" ? metadata["height"] : null
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
  spec: {
    name: "list_images",
    description:
      "List available image assets as lightweight handles — id, name, type, size, " +
      "dimensions. No pixels are loaded, so this is cheap. Call view_image with an " +
      "id when you need to actually see one.",
    inputSchema: zodToJsonSchema(LIST_IMAGES_SCHEMA),
    category: "read",
    userMessage: () => "Listing image assets"
  },
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

const REGION_SCHEMA = z
  .object({
    x: z.number().describe("Left edge of the crop, in source pixels."),
    y: z.number().describe("Top edge of the crop, in source pixels."),
    width: z.number().describe("Crop width in source pixels."),
    height: z.number().describe("Crop height in source pixels.")
  })
  .describe(
    "Optional crop box, in source-image pixels. When set, only this region is " +
      "loaded into view — useful for zooming into part of a large image."
  );

/** The Zod identity of `view_image`. The deprecated class keeps it on `schema`. */
export const VIEW_IMAGE_SCHEMA = z
  .object({
    image_id: z
      .string()
      .describe(
        "Which image to view: an asset id, an asset:// URI, an http(s) URL, or " +
          "a data: URI. Use an id from list_images or from a prior tool result."
      ),
    question: z
      .string()
      .optional()
      .describe("What to look for; shown to you alongside the image."),
    detail: z
      .enum(["low", "high"])
      .optional()
      .describe(
        "high (default) keeps full resolution; low downsamples the longest side " +
          "to ~768px to spend fewer tokens."
      ),
    region: REGION_SCHEMA.optional()
  })
  .loose();

const LOW_DETAIL_MAX_SIDE = 768;

function parseRegion(value: unknown): ImageRegion | undefined {
  if (!value || typeof value !== "object") return undefined;
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
        const prepared = await extractImageRegion(sourceBytes, {
          ...(region ? { region } : {}),
          ...(maxSide ? { maxSide } : {}),
          sourceMime
        });
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
    typeof params["question"] === "string" ? params["question"].trim() : "";
  const dims = width && height ? ` (${width}×${height})` : "";
  const regionNote = region
    ? ` region ${region.x},${region.y} ${region.width}×${region.height}`
    : "";
  const note =
    question ||
    `Image ${imageId}${regionNote}${dims}:` +
      (notes.length ? ` ${notes.join(" ")}` : "");

  return {
    ok: true,
    image_id: imageId,
    mimeType: outMime,
    detail,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    note,
    image_content: { uri: outUri, mimeType: outMime }
  };
};

const viewImage: CapabilityExport = {
  spec: {
    name: "view_image",
    description:
      "Load the actual pixels of an image into your view so you can inspect it. " +
      "You normally hold only image handles (id, size, type) — call view_image " +
      "when you genuinely need to see one. Pass a region to zoom into part of it, " +
      "or detail:'low' to save tokens. The image appears in your next turn.",
    inputSchema: zodToJsonSchema(VIEW_IMAGE_SCHEMA),
    category: "read",
    userMessage: (params) => `Viewing image ${String(params["image_id"] ?? "")}`
  },
  impl: withZodValidation("view_image", VIEW_IMAGE_SCHEMA, viewImageCore)
};

/** Every asset capability, in the order `getAllMcpTools` offered them. */
export const ASSET_CAPABILITIES: readonly CapabilityExport[] = [
  listAssets,
  getAsset,
  saveAsset,
  readAsset,
  assetSearch,
  assetList,
  listImages,
  viewImage
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
  viewImage
};
