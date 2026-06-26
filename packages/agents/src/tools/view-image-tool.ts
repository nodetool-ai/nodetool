/**
 * Lazy image viewing for agents.
 *
 * `ListImagesTool` lets the agent discover image assets as cheap handles (id,
 * name, type, size) without loading any pixels. `ViewImageTool` is the special
 * runtime primitive: given a handle it loads the pixels (optionally a cropped
 * region or a downscaled "low" detail view) and hands them back under
 * `image_content`. The agent tool loop recognizes that field and injects the
 * pixels into the model's next turn (see `image-injection.ts`), so the model
 * sees an image only after it asks for one — keeping the standing context cheap.
 */
import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  extractImageRegion,
  type ImageRegion,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { Asset } from "@nodetool-ai/models";
import { Tool } from "./base-tool.js";

/** Sniff the mime type of encoded image bytes by magic number. */
function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
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
function parseDataUri(uri: string): { bytes: Uint8Array; mimeType: string } | null {
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

const VIEW_IMAGE_SCHEMA = z
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

export class ViewImageTool extends Tool {
  readonly name = "view_image";
  readonly description =
    "Load the actual pixels of an image into your view so you can inspect it. " +
    "You normally hold only image handles (id, size, type) — call view_image " +
    "when you genuinely need to see one. Pass a region to zoom into part of it, " +
    "or detail:'low' to save tokens. The image appears in your next turn.";

  override get schema() {
    return VIEW_IMAGE_SCHEMA;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const imageId = String(params["image_id"] ?? "").trim();
    if (!imageId) {
      return { error: "image_id is required" };
    }

    const region = this.parseRegion(params["region"]);
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
      const needsTransform = Boolean(region) || maxSide !== undefined;
      if (!needsTransform) {
        // No crop or downscale requested: ship the original bytes unchanged.
        // Re-encoding a well-compressed source through the codec can bloat it
        // many-fold (a 44KB screenshot PNG re-encoded to >1MB), wasting tokens
        // and bandwidth for no visual gain.
        outUri = `data:${sourceMime};base64,${Buffer.from(sourceBytes).toString("base64")}`;
        outMime = sourceMime;
      } else {
        try {
          const prepared = await extractImageRegion(sourceBytes, {
            ...(region ? { region } : {}),
            ...(maxSide ? { maxSide } : {})
          });
          outUri = `data:${prepared.mimeType};base64,${Buffer.from(prepared.data).toString("base64")}`;
          outMime = prepared.mimeType;
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
      notes.push("Region crop is not applied to remote URLs; showing the full image.");
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
  }

  private parseRegion(value: unknown): ImageRegion | undefined {
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

  userMessage(params: Record<string, unknown>): string {
    return `Viewing image ${String(params["image_id"] ?? "")}`;
  }
}

const LIST_IMAGES_SCHEMA = z
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

export class ListImagesTool extends Tool {
  readonly name = "list_images";
  readonly description =
    "List available image assets as lightweight handles — id, name, type, size, " +
    "dimensions. No pixels are loaded, so this is cheap. Call view_image with an " +
    "id when you need to actually see one.";

  override get schema() {
    return LIST_IMAGES_SCHEMA;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const userId = context.userId;
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
  }

  userMessage(): string {
    return "Listing image assets";
  }
}
