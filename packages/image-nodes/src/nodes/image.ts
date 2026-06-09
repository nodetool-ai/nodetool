import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import {
  type BlendMode,
  blendModeGpuId,
  coerceBlendMode
} from "@nodetool-ai/gpu";
import {
  compositeImageLayers,
  type LayerTransform2D
} from "@nodetool-ai/gpu/node";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import { RAW_RGBA_MIME, isRawRgbaImage } from "@nodetool-ai/protocol";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
// Import from browser-safe subpaths (not the runtime barrel, which drags in the
// provider / python-bridge stack) so this module can bundle for the browser.
import { loadMediaRefBytes } from "@nodetool-ai/runtime/media-ref-bytes";
import { mapPromptAssetsToInputs } from "@nodetool-ai/runtime/prompt-asset-refs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  tagAsHybrid,
  tagAsServer,
  tagAsContentCard
} from "@nodetool-ai/nodes-utils";
import * as d from "typegpu/data";
import {
  transformCropV1,
  transformResizeV1,
  transformPadV1,
  transformRotate90V1,
  transformMirrorV1,
  transformAffineV1,
  blurGaussianV1,
  filtersBlurSeparableV1,
  colorGrayscaleV1,
  colorChannelShuffleV1,
  colorLevelsV1,
  mixerOverV1
} from "@nodetool-ai/gpu/pool";
import { IS_NODE } from "@nodetool-ai/config";
import { runShaderNode, runRecipeNode } from "./lib-shader-utils.js";
import { decodeRgba, rawRgbaImageRef, loadSharp } from "./image-io.js";

type ImageRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  mimeType?: string;
  width?: number;
  height?: number;
};

function toBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  // Strip data URI prefix if present (e.g. "data:image/png;base64,...").
  const comma = data.startsWith("data:") ? data.indexOf(",") : -1;
  const b64 = comma >= 0 ? data.slice(comma + 1) : data;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

async function imageBytesAsync(image: unknown, context?: ProcessingContext): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const bytes = await loadMediaRefBytes(image as ImageRefLike, context);
  return bytes ?? new Uint8Array();
}

/**
 * Whether an image ref already points at a source (a wired-in upstream image,
 * a stored asset, or inline bytes) rather than the empty default. Used to
 * decide if an inline `asset://` mention in the prompt should supply the input.
 */
function imageRefHasSource(image: unknown): boolean {
  if (!image || typeof image !== "object") return false;
  const ref = image as ImageRefLike & { asset_id?: unknown };
  if (typeof ref.uri === "string" && ref.uri.trim() !== "") return true;
  if (ref.data != null && ref.data !== "") return true;
  return ref.asset_id != null && ref.asset_id !== "";
}

/**
 * Normalize an image input that may be a single ImageRef (legacy single-image
 * wiring) or a list of refs into an array, dropping non-object entries.
 */
function normalizeImageList(value: unknown): ImageRefLike[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  return items.filter(
    (item): item is ImageRefLike => !!item && typeof item === "object"
  );
}

function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) {
    try {
      return fileURLToPath(new URL(uriOrPath));
    } catch {
      // Fallback for non-standard URIs like file://C:\path
      return uriOrPath.slice("file://".length);
    }
  }
  return uriOrPath;
}

function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

function imageRef(data: Uint8Array, extras: Partial<ImageRef> = {}): ImageRef {
  return {
    type: "image",
    data: Buffer.from(data).toString("base64"),
    ...extras
  };
}

// `decodeRgba` and `rawRgbaImageRef` are the env-aware (sharp-free) codec
// helpers from ./image-io — re-exported so existing importers keep resolving
// them from this module.
export { decodeRgba, rawRgbaImageRef };

function inferImageMime(uri: string | undefined, bytes: Uint8Array): string {
  const lower = (uri ?? "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (bytes.length < 4) return "image/unknown";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // "R"
    bytes[1] === 0x49 && // "I"
    bytes[2] === 0x46 && // "F"
    bytes[3] === 0x46 && // "F"
    bytes[8] === 0x57 && // "W"
    bytes[9] === 0x45 && // "E"
    bytes[10] === 0x42 && // "B"
    bytes[11] === 0x50 // "P"
  )
    return "image/webp";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return "image/unknown";
}

function getModelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = (props.model ?? {}) as Record<string, unknown>;
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

const IMAGE_ASPECT_RATIOS: Record<string, [number, number]> = {
  "21:9": [21, 9],
  "16:9": [16, 9],
  "3:2": [3, 2],
  "7:5": [7, 5],
  "4:3": [4, 3],
  "5:4": [5, 4],
  "1:1": [1, 1],
  "9:16": [9, 16],
  "2:3": [2, 3],
  "5:7": [5, 7],
  "3:4": [3, 4],
  "4:5": [4, 5]
};

const IMAGE_RESOLUTION_PX: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096
};

function resolveImageSize(
  resolution: string,
  aspectRatio: string
): { width: number; height: number } {
  const base = IMAGE_RESOLUTION_PX[resolution] ?? 1024;
  const [aw, ah] = IMAGE_ASPECT_RATIOS[aspectRatio] ?? [1, 1];
  if (aw >= ah) {
    const height = base;
    const width = Math.round((height * aw) / ah);
    return { width, height };
  }
  const width = base;
  const height = Math.round((width * ah) / aw);
  return { width, height };
}

const IMAGE_ASPECT_RATIO_VALUES = Object.keys(IMAGE_ASPECT_RATIOS);
const IMAGE_RESOLUTION_VALUES = Object.keys(IMAGE_RESOLUTION_PX);
const IMAGE_EDIT_STRENGTH_VALUES = [0.25, 0.5, 0.65, 0.75, 0.85, 1.0];

function hasProviderSupport(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
} {
  return (
    !!context &&
    typeof context.runProviderPrediction === "function" &&
    !!providerId &&
    !!modelId
  );
}

async function metadataFor(
  bytes: Uint8Array
): Promise<{ width: number | undefined; height: number | undefined }> {
  try {
    const sharp = await loadSharp();
    const md = await sharp(bytes).metadata();
    return {
      width: md.width ?? undefined,
      height: md.height ?? undefined
    };
  } catch {
    return { width: undefined, height: undefined };
  }
}

export class LoadImageFileNode extends BaseNode {
  static readonly nodeType = "nodetool.image.LoadImageFile";
  static readonly title = "Load Image File";
  static readonly description =
    "Read an image file from disk.\n    image, input, load, file";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["path"];
  static readonly inputFields = [];

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the image file to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = filePath(String(this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    const meta = await metadataFor(data);
    return {
      output: imageRef(data, {
        uri: `file://${p}`,
        mimeType: inferImageMime(p, data),
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class LoadImageFolderNode extends BaseNode {
  static readonly nodeType = "nodetool.image.LoadImageFolder";
  static readonly title = "Load Image Folder";
  static readonly description =
    "Load all images from a folder, optionally including subfolders.\n    image, load, folder, files";
  static readonly metadataOutputTypes = {
    image: "image",
    path: "str",
    images: "list"
  };
  static readonly inlineFields = ["folder"];
  static readonly inputFields = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    image: { kind: "iteration", source: "__execution__", group: "items" },
    path: { kind: "iteration", source: "__execution__", group: "items" },
    images: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder to scan for images"
  })
  declare folder: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Subdirectories",
    description: "Include images in subfolders"
  })
  declare include_subdirectories: any;

  @prop({
    type: "list[str]",
    default: [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tiff"],
    title: "Extensions",
    description: "Image file extensions to include"
  })
  declare extensions: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Pattern to match image files"
  })
  declare pattern: any;

  async process(): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    let firstPath = "";
    for await (const item of this._loadImages()) {
      if (collected.length === 0) firstPath = String(item.path ?? "");
      collected.push(item.image as Record<string, unknown>);
    }
    return {
      image: collected[0] ?? {},
      path: firstPath,
      images: collected
    };
  }

  private async *_loadImages(): AsyncGenerator<Record<string, unknown>> {
    const raw = this.folder;
    const folder =
      typeof raw === "string" && raw.length > 0
        ? raw.startsWith("file:")
          ? filePath(raw)
          : raw
        : typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>).uri === "string" && ((raw as Record<string, unknown>).uri as string).length > 0
          ? filePath((raw as Record<string, unknown>).uri as string)
          : "";
    if (!folder) return;
    const extensions: string[] = Array.isArray(this.extensions)
      ? this.extensions.map((e: string) => String(e).toLowerCase())
      : [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tiff"];
    const patternStr = String(this.pattern ?? "");
    const patternRegex = patternStr
      ? new RegExp(
          "^" +
            patternStr
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .replace(/\*/g, ".*")
              .replace(/\?/g, ".") +
            "$",
          "i"
        )
      : null;

    const files: { fullPath: string; name: string }[] = [];
    const collect = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        // directory does not exist or is not accessible
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory() && this.include_subdirectories) {
          await collect(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          files.push({ fullPath: path.join(dir, entry.name), name: entry.name });
        }
      }
    };
    await collect(folder);

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!extensions.includes(ext)) continue;
      if (patternRegex && !patternRegex.test(file.name)) continue;
      const data = new Uint8Array(await fs.readFile(file.fullPath));
      const meta = await metadataFor(data);
      yield {
        image: imageRef(data, {
          uri: `file://${file.fullPath}`,
          mimeType: inferImageMime(file.fullPath, data),
          width: meta.width,
          height: meta.height
        }),
        path: file.fullPath
      };
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this._loadImages()) {
      collected.push(item.image as Record<string, unknown>);
      yield item;
    }
    yield { images: collected };
  }
}

export class SaveImageFileImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.SaveImageFile";
  static readonly title = "Save Image File";
  static readonly description =
    "Write an image to disk.\n    image, output, save, file";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["filename"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to save"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        The name of the image file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Overwrite the file if it already exists, otherwise file will be renamed"
  })
  declare overwrite: any;

  async process(): Promise<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const filename = dateName(String(this.filename ?? "image.png"));
    let p = filePath(path.resolve(folder, filename));
    await fs.mkdir(path.dirname(p), { recursive: true });

    if (!this.overwrite) {
      const ext = path.extname(p);
      const base = p.slice(0, p.length - ext.length);
      let counter = 1;
      while (true) {
        try {
          await fs.access(p);
          p = `${base}_${counter}${ext}`;
          counter++;
        } catch {
          break;
        }
      }
    }

    await fs.writeFile(p, await imageBytesAsync(this.image));
    return { output: p };
  }
}

export class LoadImageAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.image.LoadImageAssets";
  static readonly title = "Load Image Assets";
  static readonly description =
    "Load images from an asset folder.\n    load, image, file, import";
  static readonly metadataOutputTypes = {
    image: "image",
    name: "str",
    images: "list"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    image: { kind: "iteration", source: "__execution__", group: "items" },
    name: { kind: "iteration", source: "__execution__", group: "items" },
    images: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the images from."
  })
  declare folder: any;

  async process(): Promise<Record<string, unknown>> {
    const loader = new LoadImageFolderNode();
    loader.assign({ folder: this.folder ?? "." });
    const result = await loader.process();
    return result;
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const loader = new LoadImageFolderNode();
    loader.assign({ folder: this.folder ?? "." });
    for await (const item of loader.genProcess()) {
      yield item;
    }
  }
}

export class SaveImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.SaveImage";
  static readonly title = "Save Image Asset";
  static readonly description =
    "Save an image to specified asset folder with customizable name format.\n    save, image, folder, naming";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to save."
  })
  declare image: any;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to save the image in."
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d_%H-%M-%S.png",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await imageBytesAsync(this.image, context);
    if (bytes.length === 0) throw new Error("The input image is not connected.");

    const name = dateName(String(this.name ?? "image.png"));
    const mime = inferImageMime(undefined, bytes);
    const meta = await metadataFor(bytes);

    // Create asset via context (persists to DB + storage)
    if (context && typeof context.createAsset === "function") {
      const folderRef = this.folder as Record<string, unknown> | undefined;
      const parentId = (folderRef?.asset_id as string) ?? null;
      const asset = (await context.createAsset({
        name,
        contentType: mime === "image/unknown" ? "image/png" : mime,
        content: bytes,
        parentId,
        nodeId: this.__node_id || null
      })) as Record<string, unknown>;

      const assetId = asset.id as string;
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ".png";
      return {
        output: imageRef(bytes, {
          uri: `asset://${assetId}${ext}`,
          mimeType: mime,
          width: meta.width,
          height: meta.height
        })
      };
    }

    // Fallback: write to filesystem
    const folder = typeof this.folder === "string" ? this.folder : ".";
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    return {
      output: imageRef(bytes, {
        uri: `file://${full}`,
        mimeType: mime,
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class GetMetadataNode extends BaseNode {
  static readonly nodeType = "nodetool.image.GetMetadata";
  static readonly title = "Get Metadata";
  static readonly description =
    "Get metadata about the input image.\n    metadata, properties, analysis, information";
  static readonly metadataOutputTypes = {
    format: "str",
    mode: "str",
    width: "int",
    height: "int",
    channels: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The input image."
  })
  declare image: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    try {
      const sharp = await loadSharp();
      const md = await sharp(bytes).metadata();
      const formatMap: Record<string, string> = {
        jpeg: "JPEG",
        png: "PNG",
        webp: "WEBP",
        gif: "GIF",
        tiff: "TIFF",
        svg: "SVG",
        heif: "HEIF",
        avif: "AVIF",
        raw: "RAW"
      };
      const channelsToMode: Record<number, string> = {
        1: "L",
        2: "LA",
        3: "RGB",
        4: "RGBA"
      };
      return {
        format: formatMap[md.format ?? ""] ?? (md.format ?? "unknown").toUpperCase(),
        mode: channelsToMode[md.channels ?? 3] ?? "RGB",
        width: md.width ?? 0,
        height: md.height ?? 0,
        channels: md.channels ?? 0
      };
    } catch {
      return {
        format: "unknown",
        mode: "RGB",
        width: image.width ?? 0,
        height: image.height ?? 0,
        channels: 0
      };
    }
  }
}

export class BatchToListNode extends BaseNode {
  static readonly nodeType = "nodetool.image.BatchToList";
  static readonly title = "Batch To List";
  static readonly description =
    "Convert an image batch to a list of image references.\n    batch, list, images, processing";
  static readonly metadataOutputTypes = {
    output: "list[image]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["batch"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Batch",
    description: "The batch of images to convert."
  })
  declare batch: any;

  async process(): Promise<Record<string, unknown>> {
    const batch = this.batch;
    if (!batch) {
      throw new Error("Batch input is empty.");
    }
    const batchObj = batch as ImageRefLike;
    if (batchObj.data == null) {
      throw new Error("Batch data is null.");
    }
    if (!Array.isArray(batchObj.data)) {
      // Single image ref — wrap in list
      return { output: [batch] };
    }
    // Unwrap batch data into individual ImageRefs
    const output = (batchObj.data as unknown[]).map((item) => {
      if (item instanceof Uint8Array || typeof item === "string") {
        return imageRef(toBytes(item));
      }
      return item;
    });
    return { output };
  }
}

export class ImagesToListNode extends BaseNode {
  static readonly nodeType = "nodetool.image.ImagesToList";
  static readonly title = "Images To List";
  static readonly description =
    "Convert all dynamic properties to a list of image references.\n    list, images, processing";
  static readonly metadataOutputTypes = {
    output: "list[image]"
  };
  static readonly supportsDynamicInputs = true;
  static readonly inlineFields = [];
  static readonly inputFields = [];

  async process(): Promise<Record<string, unknown>> {
    const out: unknown[] = [];
    for (const [, value] of this.dynamicProps) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item != null) out.push(item);
        }
      } else {
        out.push(value);
      }
    }
    return { output: out };
  }
}

/**
 * Image / sketch editor node. Execution uses properties and per-layer outputs
 * written by the web UI (flattened image, mask, optional exposed layers).
 */
export class ImageEditorNode extends BaseNode {
  static readonly nodeType = "nodetool.image.ImageEditor";
  static readonly title = "Image Editor";
  static readonly description =
    "Layered sketch and image editor: draw, paint, mask, and composite.\n    sketch, image editor, draw, paint, layers, mask, canvas, composite\n\n    - Build masks for inpainting workflows\n    - Annotate or rough-in compositions before generation\n    - Per-layer inputs/outputs when exposed in the editor";
  static readonly metadataOutputTypes = {
    image: "image",
    mask: "image",
    layers: "list[image]"
  };
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly inlineFields = ["sketch_data"];
  static readonly inputFields = ["image", "mask"];

  @prop({
    type: "str",
    default: "",
    title: "Sketch data",
    description: "Serialized editor document (managed by the UI)."
  })
  declare sketch_data: unknown;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Flattened composite (filled when you edit in the UI)."
  })
  declare image: unknown;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Mask",
    description: "Mask output when configured in the editor."
  })
  declare mask: unknown;

  @prop({
    type: "list",
    default: [],
    title: "Layers",
    description: "List of exposed layer image references."
  })
  declare layers: unknown;

  async process(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      image: this.image,
      mask: this.mask,
      layers: Array.isArray(this.layers) ? this.layers : []
    };
    for (const [key, value] of this.dynamicProps) {
      if (key.startsWith("layer_out_")) {
        result[key] = value;
      }
    }
    return result;
  }
}

abstract class TransformImageNode extends BaseNode {
  protected transformMeta(): Record<string, unknown> {
    const image = ((this as any).image ?? {}) as ImageRefLike;
    return {
      width: Number((this as any).width ?? image.width ?? 0) || null,
      height: Number((this as any).height ?? image.height ?? 0) || null
    };
  }
}

export class PasteNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Paste";
  static readonly title = "Paste";
  static readonly description =
    "Paste one image onto another at specified coordinates.\n    paste, composite, positioning, overlay";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image", "paste"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to paste into."
  })
  declare image: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Paste",
    description: "The image to paste."
  })
  declare paste: any;

  @prop({
    type: "int",
    default: 0,
    title: "Left",
    description: "The left coordinate.",
    min: 0,
    max: 4096
  })
  declare left: any;

  @prop({
    type: "int",
    default: 0,
    title: "Top",
    description: "The top coordinate.",
    min: 0,
    max: 4096
  })
  declare top: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const paste = (this.paste ?? {}) as ImageRefLike;
    const left = Math.max(0, Number(this.left ?? 0));
    const top = Math.max(0, Number(this.top ?? 0));
    const base = await decodeRgba(image, context);
    if (!base.width || !base.height) return { output: image };
    const over = await decodeRgba(paste, context);
    if (!over.width || !over.height) {
      return { output: rawRgbaImageRef(base.rgba, base.width, base.height) };
    }

    // Place the overlay into a base-sized canvas at (left, top): pad in UV
    // relative to the overlay, but force the output to the base dimensions so
    // an overlay overhanging the base edge is clipped (mirrors sharp.composite).
    const placed = await runShaderNode(
      transformPadV1,
      {
        left: left / over.width,
        top: top / over.height,
        right: Math.max(0, base.width - over.width - left) / over.width,
        bottom: Math.max(0, base.height - over.height - top) / over.height,
        color: d.vec4f(0, 0, 0, 0)
      },
      paste,
      { outputWidth: base.width, outputHeight: base.height },
      context
    );

    // Source-over composite the placed overlay onto the base.
    const output = await runShaderNode(
      mixerOverV1,
      { opacity: 1 },
      image,
      { extraInputs: { over: placed } },
      context
    );
    return { output };
  }
}

export class ScaleNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Scale";
  static readonly title = "Scale";
  static readonly description =
    "Enlarge or shrink an image by a scale factor.\n    image, resize, scale";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to scale."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 1,
    title: "Scale",
    description: "The scale factor.",
    min: 0,
    max: 10
  })
  declare scale: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const requestedScale = Number(this.scale ?? 0);
    const scale = requestedScale > 0 ? requestedScale : 1;
    const { width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    const output = await runShaderNode(
      transformResizeV1,
      { mode: 1 },
      image,
      {
        outputWidth: Math.max(1, Math.round(srcW * scale)),
        outputHeight: Math.max(1, Math.round(srcH * scale))
      },
      context
    );
    return { output };
  }
}

export class ResizeNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Resize";
  static readonly title = "Resize";
  static readonly description =
    "Change image dimensions to specified width and height.\n    image, resize";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to resize."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 512,
    title: "Width",
    description: "The target width.",
    min: 0,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 512,
    title: "Height",
    description: "The target height.",
    min: 0,
    max: 4096
  })
  declare height: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const { width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    let w = Number(this.width ?? 0);
    let h = Number(this.height ?? 0);
    // A zero dimension means "preserve aspect from the other" (matches the old
    // sharp behaviour where one undefined dimension is derived from the source).
    if (w <= 0 && h <= 0) {
      w = srcW;
      h = srcH;
    } else if (w <= 0) {
      w = Math.max(1, Math.round((srcW / srcH) * h));
    } else if (h <= 0) {
      h = Math.max(1, Math.round((srcH / srcW) * w));
    }
    const output = await runShaderNode(
      transformResizeV1,
      { mode: 1 },
      image,
      { outputWidth: Math.round(w), outputHeight: Math.round(h) },
      context
    );
    return { output };
  }
}

export class CanvasResizeNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.CanvasResize";
  static readonly title = "Canvas Resize";
  static readonly description =
    "Expand the canvas around an image without scaling its pixels.\n    canvas, resize, pad, outpaint, expand";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [
    "mode",
    "width",
    "height",
    "scale",
    "padding_unit",
    "top",
    "bottom",
    "left",
    "right"
  ];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to place on the expanded canvas."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "padding",
    values: ["fixed", "scale", "padding"],
    title: "Mode",
    description: "How to resize the canvas."
  })
  declare mode: any;

  @prop({
    type: "int",
    default: 512,
    title: "Width",
    description: "Target canvas width (fixed mode).",
    min: 1,
    max: 8192
  })
  declare width: any;

  @prop({
    type: "int",
    default: 512,
    title: "Height",
    description: "Target canvas height (fixed mode).",
    min: 1,
    max: 8192
  })
  declare height: any;

  @prop({
    type: "float",
    default: 1.25,
    title: "Scale",
    description: "Canvas scale factor relative to the source image.",
    min: 0.01,
    max: 10
  })
  declare scale: any;

  @prop({
    type: "enum",
    default: "px",
    values: ["px", "percent"],
    title: "Padding unit",
    description: "Whether padding values are pixels or percent of source size."
  })
  declare padding_unit: any;

  @prop({
    type: "float",
    default: 0,
    title: "Top",
    description: "Padding above the image.",
    min: 0,
    max: 4096
  })
  declare top: any;

  @prop({
    type: "float",
    default: 0,
    title: "Bottom",
    description: "Padding below the image.",
    min: 0,
    max: 4096
  })
  declare bottom: any;

  @prop({
    type: "float",
    default: 0,
    title: "Left",
    description: "Padding to the left of the image.",
    min: 0,
    max: 4096
  })
  declare left: any;

  @prop({
    type: "float",
    default: 0,
    title: "Right",
    description: "Padding to the right of the image.",
    min: 0,
    max: 4096
  })
  declare right: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const { width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    const mode = String(this.mode ?? "padding");

    let canvasW: number;
    let canvasH: number;
    let offsetX: number;
    let offsetY: number;

    if (mode === "fixed") {
      canvasW = Math.max(1, Math.floor(Number(this.width ?? srcW)));
      canvasH = Math.max(1, Math.floor(Number(this.height ?? srcH)));
      offsetX = Math.floor((canvasW - srcW) / 2);
      offsetY = Math.floor((canvasH - srcH) / 2);
    } else if (mode === "scale") {
      const scale = Number(this.scale ?? 0) > 0 ? Number(this.scale ?? 1) : 1;
      canvasW = Math.max(1, Math.round(srcW * scale));
      canvasH = Math.max(1, Math.round(srcH * scale));
      offsetX = Math.floor((canvasW - srcW) / 2);
      offsetY = Math.floor((canvasH - srcH) / 2);
    } else {
      const unit = String(this.padding_unit ?? "px");
      const toPx = (val: number, dim: number): number =>
        unit === "percent"
          ? Math.max(0, Math.round((dim * val) / 100))
          : Math.max(0, Math.floor(val));
      const left = toPx(Number(this.left ?? 0), srcW);
      const right = toPx(Number(this.right ?? 0), srcW);
      const top = toPx(Number(this.top ?? 0), srcH);
      const bottom = toPx(Number(this.bottom ?? 0), srcH);
      canvasW = Math.max(1, srcW + left + right);
      canvasH = Math.max(1, srcH + top + bottom);
      offsetX = left;
      offsetY = top;
    }

    // Pad placing the source at (offsetX, offsetY) in the larger canvas. The pad
    // shader works in normalized-UV units relative to the source; output dims
    // are derived from those (we also pass the absolute target as the host size).
    const leftPad = Math.max(0, offsetX);
    const topPad = Math.max(0, offsetY);
    const rightPad = Math.max(0, canvasW - srcW - offsetX);
    const bottomPad = Math.max(0, canvasH - srcH - offsetY);
    const output = await runShaderNode(
      transformPadV1,
      {
        left: leftPad / srcW,
        top: topPad / srcH,
        right: rightPad / srcW,
        bottom: bottomPad / srcH,
        color: d.vec4f(0, 0, 0, 0)
      },
      image,
      {
        outputWidth: srcW + leftPad + rightPad,
        outputHeight: srcH + topPad + bottomPad
      },
      context
    );
    return { output };
  }
}

export class CropNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Crop";
  static readonly title = "Crop";
  static readonly description =
    "Crop an image to specified coordinates.\n    image, crop";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to crop."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 0,
    title: "Left",
    description: "The left coordinate.",
    min: 0,
    max: 4096
  })
  declare left: any;

  @prop({
    type: "int",
    default: 0,
    title: "Top",
    description: "The top coordinate.",
    min: 0,
    max: 4096
  })
  declare top: any;

  @prop({
    type: "int",
    default: 512,
    title: "Right",
    description: "The right coordinate.",
    min: 0,
    max: 4096
  })
  declare right: any;

  @prop({
    type: "int",
    default: 512,
    title: "Bottom",
    description: "The bottom coordinate.",
    min: 0,
    max: 4096
  })
  declare bottom: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    // Crop is defined in pixels; the GPU crop shader samples a normalized-UV
    // sub-rectangle, so resolve source dims first to convert px → UV.
    const { width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    const left = Math.max(0, Math.min(srcW - 1, Number(this.left ?? 0)));
    const top = Math.max(0, Math.min(srcH - 1, Number(this.top ?? 0)));
    const right = Math.max(left + 1, Math.min(srcW, Number(this.right ?? srcW)));
    const bottom = Math.max(top + 1, Math.min(srcH, Number(this.bottom ?? srcH)));
    const cropW = right - left;
    const cropH = bottom - top;
    const output = await runShaderNode(
      transformCropV1,
      {
        originX: left / srcW,
        originY: top / srcH,
        width: cropW / srcW,
        height: cropH / srcH
      },
      image,
      { outputWidth: cropW, outputHeight: cropH },
      context
    );
    return { output };
  }
}

export class FitNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Fit";
  static readonly title = "Fit";
  static readonly description =
    "Resize an image to fit within specified dimensions while preserving aspect ratio.\n    image, resize, fit";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to fit."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 512,
    title: "Width",
    description: "Width to fit to.",
    min: 1,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 512,
    title: "Height",
    description: "Height to fit to.",
    min: 1,
    max: 4096
  })
  declare height: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const targetW = Math.max(1, Number(this.width ?? 512));
    const targetH = Math.max(1, Number(this.height ?? 512));
    const { width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    // Fit inside the target box, preserving aspect ratio (never upscale past
    // the box on either axis).
    const ratio = Math.min(targetW / srcW, targetH / srcH);
    const output = await runShaderNode(
      transformResizeV1,
      { mode: 1 },
      image,
      {
        outputWidth: Math.max(1, Math.round(srcW * ratio)),
        outputHeight: Math.max(1, Math.round(srcH * ratio))
      },
      context
    );
    return { output };
  }
}

export class TextToImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.TextToImage";
  static readonly body = "content_card";
  static readonly title = "Text To Image";
  static readonly description =
    "Generate images from text prompts using any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).\n    image, generation, AI, text-to-image, t2i";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "huggingface_fal_ai",
      id: "fal-ai/flux/schnell",
      name: "FLUX.1 Schnell",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The image generation model to use"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "A cat holding a sign that says hello world",
    title: "Prompt",
    description: "Text prompt describing the desired image"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid in the image"
  })
  declare negative_prompt: any;

  @prop({
    type: "str",
    default: "1:1",
    title: "Aspect Ratio",
    description: "Aspect ratio of the generated image",
    values: IMAGE_ASPECT_RATIO_VALUES,
    json_schema_extra: { type: "media_aspect_ratio_image" }
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "1K",
    title: "Resolution",
    description: "Output resolution (short edge in pixels)",
    values: IMAGE_RESOLUTION_VALUES,
    json_schema_extra: { type: "media_resolution_image" }
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 3600
  })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = String(this.prompt ?? "");
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const resolution = String(this.resolution ?? "1K");
    const { width, height } = resolveImageSize(resolution, aspectRatio);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for text-to-image generation.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "text_to_image",
      model: modelId,
      params: {
        prompt,
        width,
        height,
        aspect_ratio: aspectRatio,
        resolution,
        negative_prompt: this.negative_prompt
      }
    })) as Uint8Array;
    const meta = await metadataFor(output);
    return {
      output: imageRef(output, {
        mimeType: inferImageMime(undefined, output),
        width: meta.width ?? width,
        height: meta.height ?? height
      })
    };
  }
}

export class ImageToImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.ImageToImage";
  static readonly body = "content_card";
  static readonly title = "Image To Image";
  static readonly description =
    "Transform images using text prompts with any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).\n    image, transformation, AI, image-to-image, i2i";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt", "image"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "huggingface_fal_ai",
      id: "fal-ai/flux/dev",
      name: "FLUX.1 Dev",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The image generation model to use"
  })
  declare model: any;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description:
      "Input image(s) to transform. The first image is the primary subject; additional images are used as references by providers that support multi-image editing."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "A photorealistic version of the input image",
    title: "Prompt",
    description: "Text prompt describing the desired transformation"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid"
  })
  declare negative_prompt: any;

  @prop({
    type: "float",
    default: 0.65,
    title: "Strength",
    description:
      "How much to transform the input image (subtle = minor edit, strong = major edit)",
    values: IMAGE_EDIT_STRENGTH_VALUES,
    json_schema_extra: { type: "media_strength" }
  })
  declare strength: any;

  @prop({
    type: "str",
    default: "1:1",
    title: "Aspect Ratio",
    description: "Aspect ratio of the output image",
    values: IMAGE_ASPECT_RATIO_VALUES,
    json_schema_extra: { type: "media_aspect_ratio_image" }
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "1K",
    title: "Resolution",
    description: "Output resolution (short edge in pixels)",
    values: IMAGE_RESOLUTION_VALUES,
    json_schema_extra: { type: "media_resolution_image" }
  })
  declare resolution: any;

  @prop({
    type: "str",
    default: "",
    title: "Scheduler",
    description: "Scheduler to use (provider-specific)"
  })
  declare scheduler: any;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 3600
  })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let images = normalizeImageList(this.image);
    let prompt = String(this.prompt ?? "");

    // Inline asset mentions (e.g. from the Prompt composer's @-mention) carry
    // an `asset://<id>.<ext>` image reference in the prompt string. Text tasks
    // expand these into image inputs; do the same here via the shared mapper —
    // route the first referenced image into the transform input when none is
    // wired in, and strip the mention out of the textual instruction.
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: prompt }],
      [
        {
          name: "image",
          kind: "image",
          hasSource: images.some(imageRefHasSource)
        }
      ],
      context
    );
    if (typeof overrides.prompt === "string") prompt = overrides.prompt;
    if (overrides.image && images.length === 0) {
      images = [overrides.image as ImageRefLike];
    }

    const bytesList = (
      await Promise.all(images.map((img) => imageBytesAsync(img, context)))
    ).filter((b) => b.length > 0);
    if (bytesList.length === 0) {
      throw new Error("The input image is empty.");
    }
    const aspectRatio = String(this.aspect_ratio ?? "1:1");
    const resolution = String(this.resolution ?? "1K");
    const { width, height } = resolveImageSize(resolution, aspectRatio);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for image-to-image generation.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "image_to_image",
      model: modelId,
      params: {
        images: bytesList,
        prompt,
        negative_prompt: this.negative_prompt,
        target_width: width,
        target_height: height,
        aspect_ratio: aspectRatio,
        resolution,
        strength: this.strength,
        scheduler: this.scheduler
      }
    })) as Uint8Array;
    const meta = await metadataFor(output);
    const sourceUri = images[0]?.uri ?? "";
    return {
      output: imageRef(output, {
        uri: sourceUri,
        mimeType: inferImageMime(sourceUri, output),
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class RotateAndFlipNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.RotateAndFlip";
  static readonly title = "Rotate & Flip";
  static readonly description =
    "Rotate and/or flip an image in a single step.\n    image, rotate, flip, mirror, orientation, transform";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to rotate and flip."
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0,
    title: "Angle",
    description: "Rotation angle in degrees (clockwise).",
    min: -360,
    max: 360
  })
  declare angle: any;

  @prop({
    type: "bool",
    default: false,
    title: "Flip Horizontal",
    description: "Mirror left/right."
  })
  declare flip_horizontal: any;

  @prop({
    type: "bool",
    default: false,
    title: "Flip Vertical",
    description: "Mirror top/bottom."
  })
  declare flip_vertical: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const angle = Number(this.angle ?? 0);
    const flipH = !!this.flip_horizontal;
    const flipV = !!this.flip_vertical;
    const { rgba, width: srcW, height: srcH } = await decodeRgba(image, context);
    if (!srcW || !srcH) return { output: image };
    const norm = ((angle % 360) + 360) % 360;
    if (norm === 0 && !flipH && !flipV) {
      return { output: rawRgbaImageRef(rgba, srcW, srcH) };
    }

    let current: unknown = image;
    let curW = srcW;
    let curH = srcH;

    // Mirror first (output is same size as source).
    if (flipH || flipV) {
      const axes = (flipH ? 1 : 0) + (flipV ? 2 : 0); // 1 H, 2 V, 3 both
      current = await runShaderNode(transformMirrorV1, { axes }, current, {}, context);
    }

    if (norm !== 0) {
      if (norm % 90 === 0) {
        const turns = (norm / 90) % 4; // 1=90°, 2=180°, 3=270° clockwise
        const swap = turns === 1 || turns === 3;
        const outW = swap ? curH : curW;
        const outH = swap ? curW : curH;
        current = await runShaderNode(
          transformRotate90V1,
          { turns },
          current,
          { outputWidth: outW, outputHeight: outH },
          context
        );
      } else {
        // Arbitrary angle: expand the canvas to the rotated bounding box and
        // feed the affine shader the UV-space inverse matrix (output uv → source
        // uv) for a clockwise rotation about the centre.
        const rad = (norm * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const outW = Math.max(
          1,
          Math.round(Math.abs(curW * cos) + Math.abs(curH * sin))
        );
        const outH = Math.max(
          1,
          Math.round(Math.abs(curW * sin) + Math.abs(curH * cos))
        );
        current = await runShaderNode(
          transformAffineV1,
          {
            m00: (cos * outW) / curW,
            m01: (sin * outH) / curW,
            tx: (curW / 2 - (cos * outW) / 2 - (sin * outH) / 2) / curW,
            m10: (-sin * outW) / curH,
            m11: (cos * outH) / curH,
            ty: (curH / 2 + (sin * outW) / 2 - (cos * outH) / 2) / curH
          },
          current,
          { outputWidth: outW, outputHeight: outH },
          context
        );
        curW = outW;
      }
    }

    return { output: current };
  }
}

export class ChannelsNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Channels";
  static readonly title = "Channels";
  static readonly description =
    "Extract a single channel from an image as a grayscale preview.\n    image, channel, red, green, blue, alpha, luminance";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to extract a channel from."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "luminance",
    title: "Channel",
    description: "Which channel to extract.",
    values: ["red", "green", "blue", "alpha", "luminance"]
  })
  declare channel: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const channel = String(this.channel ?? "luminance");

    if (channel === "luminance") {
      return {
        output: await runShaderNode(colorGrayscaleV1, { amount: 1 }, image, {}, context)
      };
    }
    const channelIndex: Record<string, number> = {
      red: 0,
      green: 1,
      blue: 2,
      alpha: 3
    };
    const from = channelIndex[channel];
    if (from === undefined) {
      // Unsupported channel — pass the source through unchanged.
      const { rgba, width, height } = await decodeRgba(image, context);
      return { output: width ? rawRgbaImageRef(rgba, width, height) : image };
    }
    // Broadcast the chosen channel onto R/G/B for a grayscale preview, keep alpha.
    const output = await runShaderNode(
      colorChannelShuffleV1,
      { rFrom: from, gFrom: from, bFrom: from, aFrom: 3 },
      image,
      {},
      context
    );
    return { output };
  }
}

export class BlurNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Blur";
  static readonly title = "Blur";
  static readonly description =
    "Blur an image — Box, Gaussian, or horizontal Motion variants.\n    image, blur, gaussian, box, motion, filter";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to blur."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "gaussian",
    title: "Type",
    description: "Blur algorithm: gaussian (smooth), box (boxcar), motion (horizontal streak).",
    values: ["gaussian", "box", "motion"]
  })
  declare blur_type: any;

  @prop({
    type: "int",
    default: 5,
    title: "Size",
    description: "Blur amount (0 = none, 100 = max).",
    min: 0,
    max: 100
  })
  declare size: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const size = Math.max(0, Math.min(100, Math.round(Number(this.size ?? 0))));
    const blurType = String(this.blur_type ?? "gaussian");

    if (size <= 0) {
      const { rgba, width, height } = await decodeRgba(image, context);
      return { output: width ? rawRgbaImageRef(rgba, width, height) : image };
    }

    // Map the 0–100 "size" onto the gaussian shader's 0–20px kernel radius;
    // sigma tracks radius for a natural falloff.
    const radius = Math.min(20, Math.max(1, size / 5));
    const sigma = Math.max(0.5, radius * 0.6);

    if (blurType === "motion") {
      // Horizontal directional blur (single-axis gaussian).
      const output = await runShaderNode(
        blurGaussianV1,
        { radius, sigma, direction: d.vec2f(1, 0) },
        image,
        {},
        context
      );
      return { output };
    }

    // gaussian + box → isotropic separable (horizontal then vertical) blur.
    const output = await runRecipeNode(
      filtersBlurSeparableV1,
      { radius, sigma },
      image,
      {},
      context
    );
    return { output };
  }
}

export class LevelsNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Levels";
  static readonly title = "Levels";
  static readonly description =
    "Adjust input black point, gamma, and white point per RGB channel.\n    image, levels, color, tone, curves";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to adjust."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 0,
    title: "Red Black",
    description: "Red channel input black point (0–255).",
    min: 0,
    max: 255
  })
  declare r_black: any;

  @prop({
    type: "float",
    default: 1,
    title: "Red Gamma",
    description: "Red channel gamma (0.01–10).",
    min: 0.01,
    max: 10
  })
  declare r_gamma: any;

  @prop({
    type: "int",
    default: 255,
    title: "Red White",
    description: "Red channel input white point (0–255).",
    min: 0,
    max: 255
  })
  declare r_white: any;

  @prop({
    type: "int",
    default: 0,
    title: "Green Black",
    description: "Green channel input black point (0–255).",
    min: 0,
    max: 255
  })
  declare g_black: any;

  @prop({
    type: "float",
    default: 1,
    title: "Green Gamma",
    description: "Green channel gamma (0.01–10).",
    min: 0.01,
    max: 10
  })
  declare g_gamma: any;

  @prop({
    type: "int",
    default: 255,
    title: "Green White",
    description: "Green channel input white point (0–255).",
    min: 0,
    max: 255
  })
  declare g_white: any;

  @prop({
    type: "int",
    default: 0,
    title: "Blue Black",
    description: "Blue channel input black point (0–255).",
    min: 0,
    max: 255
  })
  declare b_black: any;

  @prop({
    type: "float",
    default: 1,
    title: "Blue Gamma",
    description: "Blue channel gamma (0.01–10).",
    min: 0.01,
    max: 10
  })
  declare b_gamma: any;

  @prop({
    type: "int",
    default: 255,
    title: "Blue White",
    description: "Blue channel input white point (0–255).",
    min: 0,
    max: 255
  })
  declare b_white: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const clamp255 = (n: number): number =>
      Math.max(0, Math.min(255, Math.round(n)));
    const clampGamma = (n: number): number => Math.max(0.01, Math.min(10, n));

    const rBlack = clamp255(Number(this.r_black ?? 0));
    const rWhite = clamp255(Number(this.r_white ?? 255));
    const rGamma = clampGamma(Number(this.r_gamma ?? 1));
    const gBlack = clamp255(Number(this.g_black ?? 0));
    const gWhite = clamp255(Number(this.g_white ?? 255));
    const gGamma = clampGamma(Number(this.g_gamma ?? 1));
    const bBlack = clamp255(Number(this.b_black ?? 0));
    const bWhite = clamp255(Number(this.b_white ?? 255));
    const bGamma = clampGamma(Number(this.b_gamma ?? 1));

    const { rgba, width, height } = await decodeRgba(image, context);
    if (!width || !height) return { output: image };

    const identity =
      rBlack === 0 && rWhite === 255 && rGamma === 1 &&
      gBlack === 0 && gWhite === 255 && gGamma === 1 &&
      bBlack === 0 && bWhite === 255 && bGamma === 1;
    if (identity) {
      return { output: rawRgbaImageRef(rgba, width, height) };
    }

    // The levels shader works in [0,1]; the node authors black/white in 0–255.
    const output = await runShaderNode(
      colorLevelsV1,
      {
        rBlack: rBlack / 255,
        rGamma,
        rWhite: rWhite / 255,
        gBlack: gBlack / 255,
        gGamma,
        gWhite: gWhite / 255,
        bBlack: bBlack / 255,
        bGamma,
        bWhite: bWhite / 255
      },
      image,
      {},
      context
    );
    return { output };
  }
}

type CompositorLayerState = {
  opacity: number;
  blend_mode: BlendMode;
  visible: boolean;
  /** Placement on the canvas, authored in the editor. Undefined → native. */
  transform?: LayerTransform2D;
};

function compositorLayerTransform(raw: unknown): LayerTransform2D | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  // A persisted transform must at least pin a position; scale defaults to 1.
  if (typeof r.x !== "number" || typeof r.y !== "number") return undefined;
  return {
    x: r.x,
    y: r.y,
    scaleX: num(r.scaleX, 1),
    scaleY: num(r.scaleY, 1),
    rotation: num(r.rotation, 0)
  };
}

function compositorLayerState(raw: unknown): CompositorLayerState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const opacity =
    typeof r.opacity === "number"
      ? Math.max(0, Math.min(1, r.opacity))
      : 1;
  const visible = r.visible === undefined ? true : !!r.visible;
  // Stored values are canonical blend modes; the legacy "over" name still
  // resolves to "normal" via coerceBlendMode.
  return {
    opacity,
    blend_mode: coerceBlendMode(r.blend_mode),
    visible,
    transform: compositorLayerTransform(r.transform)
  };
}

/**
 * Compositor — stacks multiple image layers with per-layer opacity and
 * blend mode. Dynamic image inputs are named `image_0`, `image_1`, ...;
 * the lowest-index input is the base (canvas), subsequent layers are
 * composited on top in index order at (0, 0). Per-layer state lives in
 * the `layers` list, indexed positionally against the sorted image
 * inputs. Hidden / zero-opacity layers are skipped.
 *
 * Compositing runs on the GPU through the shared WebGPULayerCompositor (the
 * same engine the sketch editor and timeline preview use), via Node.js Dawn —
 * the blend math is identical to the browser path. WebGPU is required; there
 * is no CPU fallback. Sharp is used only as the codec layer: decode each layer
 * to straight-alpha RGBA on the way in, encode the composite to PNG on the
 * way out.
 */
export class CompositorNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Compositor";
  static readonly title = "Compositor";
  static readonly description =
    "Composite multiple image layers with per-layer opacity and blend mode.\n    image, compositor, blend, layers, mask";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly supportsDynamicInputs = true;
  static readonly inlineFields = [];
  static readonly inputFields = [];

  @prop({
    type: "list",
    default: [],
    title: "Layers",
    description:
      "Per-layer state (positional): { opacity, blend_mode, visible, transform }."
  })
  declare layers: unknown;

  @prop({
    type: "int",
    default: 0,
    title: "Canvas width",
    description:
      "Composite canvas width in pixels. 0 → use the first visible layer's width."
  })
  declare canvas_width: number;

  @prop({
    type: "int",
    default: 0,
    title: "Canvas height",
    description:
      "Composite canvas height in pixels. 0 → use the first visible layer's height."
  })
  declare canvas_height: number;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    type LayerInput = {
      index: number;
      image: ImageRefLike;
      state: CompositorLayerState;
    };
    const layerStates = Array.isArray(this.layers) ? this.layers : [];

    // Collect dynamic image_N inputs, sorted ascending by N. Position in
    // that sorted list is the index into `layers` for per-layer state.
    const collected: { index: number; image: ImageRefLike }[] = [];
    for (const [key, value] of this.dynamicProps) {
      const m = /^image_(\d+)$/.exec(key);
      if (!m || !value || typeof value !== "object") continue;
      collected.push({ index: Number(m[1]), image: value as ImageRefLike });
    }
    collected.sort((a, b) => a.index - b.index);

    const inputs: LayerInput[] = collected.map((c, i) => ({
      ...c,
      state: compositorLayerState(layerStates[i])
    }));

    const visible = inputs.filter(
      (l) => l.state.visible && l.state.opacity > 0
    );

    if (visible.length === 0) {
      return {
        output: imageRef(new Uint8Array(), {
          uri: "",
          width: undefined,
          height: undefined
        })
      };
    }

    // Decode each visible layer to straight-alpha RGBA. Each layer is placed
    // by its authored transform (default: top-left at the canvas origin).
    const decoded: {
      rgba: Uint8Array;
      width: number;
      height: number;
      opacity: number;
      blendModeId: number;
      transform?: LayerTransform2D;
    }[] = [];
    for (const layer of visible) {
      try {
        // Reuses an upstream GPU op's raw RGBA when present (skips the PNG
        // decode); otherwise decodes the encoded bytes.
        const { rgba, width, height } = await decodeRgba(layer.image, context);
        if (rgba.length === 0) continue;
        decoded.push({
          rgba,
          width,
          height,
          opacity: layer.state.opacity,
          blendModeId: blendModeGpuId(layer.state.blend_mode),
          transform: layer.state.transform
        });
      } catch (err) {
        // Undecodable input → skip this layer, keep the rest of the stack.
        console.warn("CompositorNode: failed to decode layer, skipping.", err);
      }
    }

    if (decoded.length === 0) {
      return {
        output: imageRef(new Uint8Array(), {
          uri: "",
          width: undefined,
          height: undefined
        })
      };
    }

    // Canvas size: explicit props win; otherwise the first layer's size.
    const canvasWidth =
      Number(this.canvas_width) > 0
        ? Math.floor(Number(this.canvas_width))
        : decoded[0].width;
    const canvasHeight =
      Number(this.canvas_height) > 0
        ? Math.floor(Number(this.canvas_height))
        : decoded[0].height;

    // Composite on the GPU through the shared headless layer compositor (the
    // same engine the sketch editor and timeline preview use). Node uses the
    // cached Dawn device; the browser acquires a navigator.gpu device.
    let result;
    if (IS_NODE) {
      result = await compositeImageLayers(decoded, canvasWidth, canvasHeight);
    } else {
      const { createBrowserGPUContext, compositeLayersHeadless } = await import(
        "@nodetool-ai/gpu/webgpu"
      );
      const ctx = await createBrowserGPUContext();
      result = await compositeLayersHeadless(
        ctx.device,
        decoded,
        canvasWidth,
        canvasHeight
      );
    }

    // Emit raw RGBA as the in-flight format — no eager PNG encode. An adjacent
    // GPU op reuses the pixels directly; any boundary that needs a portable
    // image (client preview, save, Python bridge) encodes to PNG lazily.
    return {
      output: rawRgbaImageRef(result.rgba, result.width, result.height)
    };
  }
}

/**
 * Painter — paint an alpha mask atop a source image. The mask is
 * authored interactively in the web UI; `mask_data` carries a base64
 * PNG of the painted mask (alpha == painted opacity). On execution we
 * decode `mask_data` into an image output (the mask itself) and emit
 * the source image alongside for downstream pipelines.
 *
 * Plan §9.E9 / §12. Standalone (not an extension of the sketch node) so
 * the bespoke body stays focused on the paint-on-image workflow.
 */
export class PainterNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Painter";
  static readonly title = "Painter";
  static readonly description =
    "Paint an alpha mask on top of an image and output the mask.\n    image, painter, mask, brush, paint";
  static readonly metadataOutputTypes = {
    mask: "image",
    image: "image"
  };
  static readonly inlineFields = ["mask_data"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Source image painted on (passed through to output)."
  })
  declare image: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Mask data",
    description:
      "Base64-encoded PNG of the painted alpha mask. Managed by the UI.",
    json_schema_extra: { hidden_in_inspector: true }
  })
  declare mask_data: unknown;

  @prop({
    type: "int",
    default: 512,
    title: "Canvas width",
    description:
      "Width of the paint canvas in pixels. Overwritten by the source image's width when an image is set."
  })
  declare canvas_width: number;

  @prop({
    type: "int",
    default: 512,
    title: "Canvas height",
    description:
      "Height of the paint canvas in pixels. Overwritten by the source image's height when an image is set."
  })
  declare canvas_height: number;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;

    // Pass the source image through (resolved bytes if available) so
    // downstream nodes that want the original image can branch off the
    // Painter without re-loading the asset.
    const imageBytes = await imageBytesAsync(image, context);
    const imageOut = imageBytes.length > 0
      ? imageRef(imageBytes, {
          uri: image.uri ?? "",
          width: image.width ?? undefined,
          height: image.height ?? undefined
        })
      : { ...image };

    // Decode the painted mask. Empty mask_data → blank mask matching
    // image dimensions (alpha = 0 everywhere).
    const maskStr = typeof this.mask_data === "string" ? this.mask_data : "";
    const maskBytes = toBytes(maskStr);

    if (maskBytes.length === 0) {
      // Fall back to a transparent canvas. Prefer the source image's
      // dimensions; otherwise use the user-configured canvas size; finally
      // 1×1 if nothing is known.
      const w = Math.max(
        1,
        Number(image.width ?? this.canvas_width ?? 1)
      );
      const h = Math.max(
        1,
        Number(image.height ?? this.canvas_height ?? 1)
      );
      try {
        const sharp = await loadSharp();
        const blank = await sharp({
          create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .png()
          .toBuffer();
        const meta = await metadataFor(blank);
        return {
          mask: imageRef(blank, {
            uri: "",
            mimeType: "image/png",
            width: meta.width,
            height: meta.height
          }),
          image: imageOut
        };
      } catch {
        return {
          mask: imageRef(new Uint8Array(), { uri: "" }),
          image: imageOut
        };
      }
    }

    // Re-encode the mask as PNG to normalize and pick up dimensions.
    try {
      const sharp = await loadSharp();
      const out = await sharp(maskBytes, { failOn: "none" })
        .png()
        .toBuffer();
      const meta = await metadataFor(out);
      return {
        mask: imageRef(out, {
          uri: "",
          mimeType: "image/png",
          width: meta.width,
          height: meta.height
        }),
        image: imageOut
      };
    } catch {
      return {
        mask: imageRef(maskBytes, { uri: "" }),
        image: imageOut
      };
    }
  }
}

export class UpscaleImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Upscale";
  static readonly body = "content_card";
  static readonly title = "Upscale Image";
  static readonly description =
    "Increase the resolution and detail of an image using any supported upscaling provider.\n    image, upscale, super-resolution, enhance, AI";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "fal_ai",
      id: "fal-ai/clarity-upscaler",
      name: "Clarity Upscaler",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The upscaling model to use"
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image",
    description: "Input image to upscale"
  })
  declare image: any;

  @prop({
    type: "int",
    default: 2,
    title: "Scale",
    description: "Target magnification factor",
    values: [2, 4]
  })
  declare scale: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Optional guidance prompt for creative upscalers"
  })
  declare prompt: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) throw new Error("The input image is empty.");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for image upscaling.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "upscale_image",
      model: modelId,
      params: {
        image: bytes,
        scale: Number(this.scale ?? 2) || undefined,
        prompt: this.prompt ? String(this.prompt) : undefined
      }
    })) as Uint8Array;
    const meta = await metadataFor(output);
    return {
      output: imageRef(output, {
        mimeType: inferImageMime(image.uri, output),
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class RemoveBackgroundNode extends BaseNode {
  static readonly nodeType = "nodetool.image.RemoveBackground";
  static readonly body = "content_card";
  static readonly title = "Remove Background";
  static readonly description =
    "Remove the background from an image, returning a cutout with transparency.\n    image, background, remove, matte, cutout, AI";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "fal_ai",
      id: "fal-ai/bria/background/remove",
      name: "Bria Background Remove",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The background-removal model to use"
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image",
    description: "Input image to remove the background from"
  })
  declare image: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) throw new Error("The input image is empty.");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for background removal.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "remove_background",
      model: modelId,
      params: { image: bytes }
    })) as Uint8Array;
    const meta = await metadataFor(output);
    return {
      output: imageRef(output, {
        mimeType: inferImageMime(image.uri, output),
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class RelightImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Relight";
  static readonly body = "content_card";
  static readonly title = "Relight Image";
  static readonly description =
    "Re-light a subject according to a text prompt using any supported relighting provider.\n    image, relight, lighting, AI";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields = [];
  static readonly inputFields = ["image", "prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "fal_ai",
      id: "fal-ai/image-apps-v2/relighting",
      name: "Relight",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The relighting model to use"
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image",
    description: "Input image to relight"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "studio lighting from the left",
    title: "Prompt",
    description: "Description of the desired lighting"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid"
  })
  declare negative_prompt: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) throw new Error("The input image is empty.");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for image relighting.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "relight_image",
      model: modelId,
      params: {
        image: bytes,
        prompt: String(this.prompt ?? ""),
        negative_prompt: this.negative_prompt
      }
    })) as Uint8Array;
    const meta = await metadataFor(output);
    return {
      output: imageRef(output, {
        mimeType: inferImageMime(image.uri, output),
        width: meta.width,
        height: meta.height
      })
    };
  }
}

export class VectorizeImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Vectorize";
  static readonly body = "content_card";
  static readonly title = "Vectorize Image";
  static readonly description =
    "Convert a raster image into a scalable vector (SVG) using any supported vectorization provider.\n    image, vector, svg, vectorize, trace, AI";
  static readonly metadataOutputTypes = { output: "svg_element" };
  static readonly inlineFields = [];
  static readonly inputFields = ["image"];

  @prop({
    type: "image_model",
    default: {
      type: "image_model",
      provider: "fal_ai",
      id: "fal-ai/recraft/vectorize",
      name: "Recraft Vectorize",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The vectorization model to use"
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
    title: "Image",
    description: "Input image to vectorize"
  })
  declare image: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) throw new Error("The input image is empty.");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!hasProviderSupport(context, providerId, modelId)) {
      throw new Error("No provider available for image vectorization.");
    }
    const output = (await context.runProviderPrediction({
      provider: providerId,
      capability: "vectorize_image",
      model: modelId,
      params: { image: bytes }
    })) as Uint8Array;
    return { output: { content: new TextDecoder().decode(output) } };
  }
}

// GPU transform nodes: pure WebGPU pixel ops (no sharp) — runnable in the
// browser and rendered as media content cards.
const IMAGE_TRANSFORM_NODES = tagAsContentCard(
  tagAsHybrid([
    PasteNode,
    ScaleNode,
    ResizeNode,
    CanvasResizeNode,
    CropNode,
    FitNode,
    RotateAndFlipNode,
    ChannelsNode,
    BlurNode,
    LevelsNode,
    CompositorNode
  ])
);

// Node-only nodes: filesystem I/O (Load/Save), provider/AI generation, the
// Dawn-only Compositor, and the canvas editors. Tagged server so the browser
// runner never tries to execute them client-side.
const IMAGE_SERVER_NODES = tagAsServer([
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  BatchToListNode,
  ImagesToListNode,
  ImageEditorNode,
  PainterNode,
  TextToImageNode,
  ImageToImageNode,
  UpscaleImageNode,
  RemoveBackgroundNode,
  RelightImageNode,
  VectorizeImageNode
]);

export const IMAGE_NODES = [
  ...IMAGE_TRANSFORM_NODES,
  ...IMAGE_SERVER_NODES
];
