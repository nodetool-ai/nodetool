/**
 * The `assets` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `assets.ts`, so nothing the
 * implementations pull in reaches the entry graph. `assets.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import { z } from "zod";
import { zodToJsonSchema, type JsonSchema } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const DEFAULT_LIMIT = 25;

export const MAX_LIMIT = 100;

export const LIST_ASSETS_SCHEMA: JsonSchema = {
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
  required: []
};

export const SAVE_ASSET_SCHEMA: JsonSchema = {
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
        "Binary content as a base64 string, for bytes you produced yourself. " +
        "For a file another tool already stored or that sits at a URL, pass " +
        "`source` instead — never read it back to base64 to pass it here."
    },
    source: {
      type: "string",
      description:
        "Where the bytes already are: an `asset_url` or `/api/storage/...` key " +
        "another tool returned (download_file, run_apify_actor, a generation), " +
        "an `asset://` URI to copy, or an http(s) URL. The host reads it and " +
        "saves the asset; the bytes never pass through the caller. Mutually " +
        "exclusive with content and content_base64."
    },
    content_type: {
      type: "string",
      description:
        "MIME type (e.g. 'text/markdown', 'application/json', 'image/png'). Defaults to text/plain for text and application/octet-stream for binary; with `source` it is taken from the response or the file extension when omitted."
    }
  },
  required: ["name"]
};

export const ASSET_SEARCH_SCHEMA: JsonSchema = {
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
  required: []
};

export const ASSET_LIST_SCHEMA: JsonSchema = {
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
  required: []
};

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

export const REGION_SCHEMA = z
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

export const listAssetsSpec: CapabilitySpec = {
  name: "list_assets",
  description: "List or search assets with flexible filtering options.",
  inputSchema: LIST_ASSETS_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query = params["query"];
    return query ? `Searching assets for '${query}'` : "Listing assets";
  }
};

export const getAssetSpec: CapabilitySpec = {
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
};

export const saveAssetSpec: CapabilitySpec = {
  name: "save_asset",
  description:
    "Save content as an asset in the library. Use this for any artifact you want to keep or surface in the chat (text reports, JSON, manifests, images, audio, video). Pass `content` for text, `content_base64` for binary bytes you produced, or `source` for a file that already exists — the asset_url / /api/storage/ key another tool returned, an asset:// URI, or an http(s) URL — so the bytes are copied host-side instead of round-tripping through base64. Returns an asset_id and asset:// URI you can reference in later steps.",
  inputSchema: SAVE_ASSET_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const name = params.name;
    if (isString(name) && name) {
      const msg = `Saving asset as ${name}...`;
      return msg.length > 80 ? "Saving asset..." : msg;
    }
    return "Saving asset...";
  }
};

export const readAssetSpec: CapabilitySpec = {
  name: "read_asset",
  description:
    "Read an asset's content. Takes the asset:// URI a generation returned (its asset_uri, with or without an extension), a bare asset id, a /api/storage/ key, or a stored file name. Returns `content` for text and `content_base64` for binary; for bytes you intend to compute on, read_media_bytes is the direct route.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "What to read: an asset:// URI, an asset id, a /api/storage/ key, or a stored file name."
      }
    },
    required: ["name"]
  },
  category: "read",
  userMessage: (params) => {
    const name = params.name;
    if (isString(name) && name) {
      const msg = `Reading asset ${name}...`;
      return msg.length > 80 ? "Reading an asset..." : msg;
    }
    return "Reading an asset...";
  }
};

export const assetSearchSpec: CapabilitySpec = {
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
    const q = isString(params.query) ? params.query : "";
    return q ? `Searching assets: ${q.slice(0, 50)}` : "Searching assets";
  }
};

export const assetListSpec: CapabilitySpec = {
  name: "asset_list",
  description:
    "List the user's most recent assets (newest first) so you can see and " +
    "reuse what has already been generated or uploaded. Filter by content_type " +
    "prefix (e.g. 'video/' for rendered videos). Returns handles with asset:// uris.",
  inputSchema: ASSET_LIST_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const ct =
      isString(params.content_type) ? params.content_type : "";
    return ct ? `Listing ${ct} assets` : "Listing recent assets";
  }
};

export const listImagesSpec: CapabilitySpec = {
  name: "list_images",
  description:
    "List available image assets as lightweight handles — id, name, type, size, " +
    "dimensions. No pixels are loaded, so this is cheap. Call view_image with an " +
    "id when you need to actually see one.",
  inputSchema: zodToJsonSchema(LIST_IMAGES_SCHEMA),
  zodSchema: LIST_IMAGES_SCHEMA,
  category: "read",
  userMessage: () => "Listing image assets"
};

export const viewImageSpec: CapabilitySpec = {
  name: "view_image",
  description:
    "Load the actual pixels of an image into your view so you can inspect it. " +
    "You normally hold only image handles (id, size, type) — call view_image " +
    "when you genuinely need to see one. Pass a region to zoom into part of it, " +
    "or detail:'low' to save tokens. The image appears in your next turn.",
  inputSchema: zodToJsonSchema(VIEW_IMAGE_SCHEMA),
  zodSchema: VIEW_IMAGE_SCHEMA,
  category: "read",
  userMessage: (params) => `Viewing image ${String(params["image_id"] ?? "")}`
};

export const updateAssetSpec: CapabilitySpec = {
  name: "update_asset",
  description:
    "Rename one of your assets, or move it into a different folder. Pass " +
    'parent_id to move it; the folder must be yours, must be a folder, and ' +
    "must not sit under the asset itself. Content type and bytes cannot be " +
    "changed here — replace the asset instead.",
  inputSchema: {
    type: "object",
    properties: {
      asset_id: { type: "string", description: "The asset to update" },
      name: { type: "string", description: "New display name" },
      parent_id: {
        type: "string",
        description:
          "Id of the destination folder. Your user id names the top-level Home folder."
      }
    },
    required: ["asset_id"]
  },
  category: "write",
  userMessage: (params) => `Updating asset ${params["asset_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const assetsSpecs: readonly CapabilitySpec[] = [
  listAssetsSpec,
  getAssetSpec,
  saveAssetSpec,
  readAssetSpec,
  assetSearchSpec,
  assetListSpec,
  listImagesSpec,
  viewImageSpec,
  updateAssetSpec
];
