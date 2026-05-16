import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

function imageBytes(image: unknown): Uint8Array {
  if (!image || typeof image !== "object") return new Uint8Array();
  return toBytes((image as ImageRefLike).data);
}

async function imageBytesAsync(image: unknown, context?: ProcessingContext): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const ref = image as ImageRefLike;
  if (ref.data) return toBytes(ref.data);
  if (typeof ref.uri === "string" && ref.uri) {
    if (context?.storage) {
      const stored = await context.storage.retrieve(ref.uri);
      if (stored !== null) return new Uint8Array(stored);
    }
    if (ref.uri.startsWith("file://")) {
      return new Uint8Array(await fs.readFile(filePath(ref.uri)));
    }
    if (ref.uri.startsWith("http://") || ref.uri.startsWith("https://")) {
      const response = await fetch(ref.uri);
      return new Uint8Array(await response.arrayBuffer());
    }
  }
  return new Uint8Array();
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
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57)
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
    const md = await sharp(bytes).metadata();
    return {
      width: md.width ?? undefined,
      height: md.height ?? undefined
    };
  } catch {
    return { width: undefined, height: undefined };
  }
}

async function transformImage(
  image: ImageRefLike,
  operation: (instance: sharp.Sharp, bytes: Uint8Array) => sharp.Sharp,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  const bytes = await imageBytesAsync(image, context);
  if (bytes.length === 0) {
    return imageRef(bytes, {
      uri: image.uri ?? "",
      width: image.width ?? undefined,
      height: image.height ?? undefined
    }) as unknown as Record<string, unknown>;
  }

  try {
    const outputBytes = await operation(
      sharp(bytes, { failOn: "none" }),
      bytes
    ).toBuffer();
    const meta = await metadataFor(outputBytes);
    return imageRef(outputBytes, {
      uri: image.uri ?? "",
      mimeType: inferImageMime(image.uri, outputBytes),
      width: meta.width,
      height: meta.height
    }) as unknown as Record<string, unknown>;
  } catch {
    return imageRef(bytes, {
      uri: image.uri ?? "",
      width: image.width ?? undefined,
      height: image.height ?? undefined
    }) as unknown as Record<string, unknown>;
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

  static readonly isStreamingOutput = true;
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
    for await (const item of this._loadImages()) {
      collected.push(item.image as Record<string, unknown>);
    }
    return {
      image: collected[0] ?? {},
      name: "",
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
        name: file.name
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

    await fs.writeFile(p, imageBytes(this.image));
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

  static readonly isStreamingOutput = true;
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
  static readonly isDynamic = true;
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
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly inlineFields = ["sketch_data"];
  static readonly inputFields = [];

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
    const baseBytes = await imageBytesAsync(image, context);
    const overlayBytes = await imageBytesAsync(paste, context);

    if (baseBytes.length === 0 || overlayBytes.length === 0) {
      return {
        output: imageRef(baseBytes, {
          uri: image.uri ?? "",
          ...this.transformMeta()
        })
      };
    }

    try {
      const outputBytes = await sharp(baseBytes, { failOn: "none" })
        .composite([{ input: Buffer.from(overlayBytes), left, top }])
        .toBuffer();
      const meta = await metadataFor(outputBytes);
      return {
        output: imageRef(outputBytes, {
          uri: image.uri ?? "",
          mimeType: inferImageMime(image.uri, outputBytes),
          width: meta.width,
          height: meta.height
        })
      };
    } catch {
      return {
        output: imageRef(baseBytes, {
          uri: image.uri ?? "",
          ...this.transformMeta()
        })
      };
    }
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
    const targetWidth = 0;
    const targetHeight = 0;
    const scale =
      requestedScale > 0
        ? requestedScale
        : targetWidth > 0 && (image.width ?? 0) > 0
          ? targetWidth / Number(image.width)
          : targetHeight > 0 && (image.height ?? 0) > 0
            ? targetHeight / Number(image.height)
            : 1;
    const output = (await transformImage(image, (instance) => {
      const fallbackWidth = image.width ?? 1;
      const fallbackHeight = image.height ?? 1;
      return instance.resize({
        width: Math.max(1, Math.round(fallbackWidth * scale)),
        height: Math.max(1, Math.round(fallbackHeight * scale))
      });
    }, context)) as Record<string, unknown>;
    const fallbackWidth =
      targetWidth > 0
        ? targetWidth
        : image.width != null
          ? Math.max(1, Math.round(Number(image.width) * scale))
          : null;
    const fallbackHeight =
      targetHeight > 0
        ? targetHeight
        : image.height != null
          ? Math.max(1, Math.round(Number(image.height) * scale))
          : null;
    return {
      output: {
        ...output,
        width: fallbackWidth ?? output.width,
        height: fallbackHeight ?? output.height
      }
    };
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
    const width = Number(this.width ?? image.width ?? 0) || null;
    const height = Number(this.height ?? image.height ?? 0) || null;
    const output = (await transformImage(image, (instance) =>
      instance.resize(width ?? undefined, height ?? undefined)
    , context)) as Record<string, unknown>;
    return {
      output: {
        ...output,
        width: output.width ?? width,
        height: output.height ?? height
      }
    };
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
    const left = Math.max(0, Number(this.left ?? 0));
    const top = Math.max(0, Number(this.top ?? 0));
    const right = Number(this.right ?? image.width ?? 0);
    const bottom = Number(this.bottom ?? image.height ?? 0);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const output = (await transformImage(image, (instance) =>
      instance.extract({ left, top, width, height })
    , context)) as Record<string, unknown>;
    return {
      output: {
        ...output,
        width: output.width ?? width,
        height: output.height ?? height
      }
    };
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
    const width = Math.max(1, Number(this.width ?? image.width ?? 512));
    const height = Math.max(1, Number(this.height ?? image.height ?? 512));
    const output = (await transformImage(image, (instance) =>
      instance.resize(width, height, { fit: "cover", position: "centre" })
    , context)) as Record<string, unknown>;
    return {
      output: {
        ...output,
        width: output.width ?? width,
        height: output.height ?? height
      }
    };
  }
}

export class TextToImageNode extends BaseNode {
  static readonly nodeType = "nodetool.image.TextToImage";
  static readonly title = "Text To Image";
  static readonly description =
    "Generate images from text prompts using any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).\n    image, generation, AI, text-to-image, t2i";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = [];
  static readonly exposeAsTool = true;
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
  static readonly title = "Image To Image";
  static readonly description =
    "Transform images using text prompts with any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).\n    image, transformation, AI, image-to-image, i2i";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = ["image"];
  static readonly autoSaveAsset = true;
  static readonly exposeAsTool = true;

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
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Input image to transform"
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
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) {
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
        image: bytes,
        prompt: String(this.prompt ?? ""),
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
    return {
      output: imageRef(output, {
        uri: image.uri ?? "",
        mimeType: inferImageMime(image.uri, output),
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
    if (angle === 0 && !flipH && !flipV) {
      const bytes = await imageBytesAsync(image, context);
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          width: image.width ?? undefined,
          height: image.height ?? undefined
        })
      };
    }
    return transformImage(
      image,
      (instance) => {
        let pipeline = instance;
        if (flipH) {
          pipeline = pipeline.flop();
        }
        if (flipV) {
          pipeline = pipeline.flip();
        }
        if (angle !== 0) {
          pipeline = pipeline.rotate(angle, {
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          });
        }
        return pipeline;
      },
      context
    );
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

    const output = (await transformImage(
      image,
      (instance) => {
        if (channel === "luminance") {
          return instance.grayscale();
        }
        if (
          channel === "red" ||
          channel === "green" ||
          channel === "blue" ||
          channel === "alpha"
        ) {
          return instance.ensureAlpha().extractChannel(channel);
        }
        throw new Error(`Unsupported channel: ${channel}`);
      },
      context
    )) as Record<string, unknown>;
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
      const bytes = await imageBytesAsync(image, context);
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          width: image.width ?? undefined,
          height: image.height ?? undefined
        })
      };
    }

    // sharp.convolve() requires kernel width AND height to be in [3, 1001];
    // anything smaller throws "Invalid convolution kernel".
    const odd = (n: number): number => (n % 2 === 0 ? n + 1 : n);

    const output = (await transformImage(
      image,
      (instance) => {
        if (blurType === "gaussian") {
          const sigma = Math.max(0.3, size * 0.5);
          return instance.blur(sigma);
        }
        if (blurType === "motion") {
          // Horizontal motion blur: w columns of 1/w in a single middle row,
          // top/bottom rows zero. Padded to 3 rows so sharp accepts it.
          const w = odd(Math.max(3, size));
          const kernel = new Array(3 * w).fill(0);
          for (let i = 0; i < w; i++) kernel[w + i] = 1 / w;
          return instance.convolve({ width: w, height: 3, kernel });
        }
        const k = odd(Math.max(3, Math.min(31, size)));
        const kernel = new Array(k * k).fill(1 / (k * k));
        return instance.convolve({ width: k, height: k, kernel });
      },
      context
    )) as Record<string, unknown>;
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
    const bytes = await imageBytesAsync(image, context);
    if (bytes.length === 0) {
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          width: image.width ?? undefined,
          height: image.height ?? undefined
        })
      };
    }

    const clamp255 = (n: number): number =>
      Math.max(0, Math.min(255, Math.round(n)));
    const clampGamma = (n: number): number =>
      Math.max(0.01, Math.min(10, n));

    const rBlack = clamp255(Number(this.r_black ?? 0));
    const rWhite = clamp255(Number(this.r_white ?? 255));
    const rGamma = clampGamma(Number(this.r_gamma ?? 1));
    const gBlack = clamp255(Number(this.g_black ?? 0));
    const gWhite = clamp255(Number(this.g_white ?? 255));
    const gGamma = clampGamma(Number(this.g_gamma ?? 1));
    const bBlack = clamp255(Number(this.b_black ?? 0));
    const bWhite = clamp255(Number(this.b_white ?? 255));
    const bGamma = clampGamma(Number(this.b_gamma ?? 1));

    const identity =
      rBlack === 0 && rWhite === 255 && rGamma === 1 &&
      gBlack === 0 && gWhite === 255 && gGamma === 1 &&
      bBlack === 0 && bWhite === 255 && bGamma === 1;
    if (identity) {
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          ...this.transformMeta()
        })
      };
    }

    const buildLut = (black: number, gamma: number, white: number) => {
      const lut = new Uint8Array(256);
      const denom = Math.max(1, white - black);
      const invGamma = 1 / gamma;
      for (let i = 0; i < 256; i++) {
        const t = Math.max(0, Math.min(1, (i - black) / denom));
        lut[i] = clamp255(Math.pow(t, invGamma) * 255);
      }
      return lut;
    };

    const lutR = buildLut(rBlack, rGamma, rWhite);
    const lutG = buildLut(gBlack, gGamma, gWhite);
    const lutB = buildLut(bBlack, bGamma, bWhite);

    try {
      const { data: raw, info } = await sharp(bytes, { failOn: "none" })
        .toColorspace("srgb")
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const channels = info.channels;
      const out = Buffer.allocUnsafe(raw.length);
      for (let i = 0; i < raw.length; i += channels) {
        out[i] = lutR[raw[i]];
        out[i + 1] = lutG[raw[i + 1]];
        out[i + 2] = lutB[raw[i + 2]];
        if (channels >= 4) {
          out[i + 3] = raw[i + 3];
        }
      }

      const outputBytes = await sharp(out, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      })
        .png()
        .toBuffer();
      const meta = await metadataFor(outputBytes);
      return {
        output: imageRef(outputBytes, {
          uri: image.uri ?? "",
          mimeType: inferImageMime(image.uri, outputBytes),
          width: meta.width,
          height: meta.height
        })
      };
    } catch (err) {
      console.error("LevelsNode processing failed:", err);
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          ...this.transformMeta()
        })
      };
    }
  }
}

const COMPOSITOR_BLEND_MODES = new Set<string>([
  "over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "add"
]);

type CompositorLayerState = {
  opacity: number;
  blend_mode: string;
  visible: boolean;
};

function compositorLayerState(raw: unknown): CompositorLayerState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const opacity =
    typeof r.opacity === "number"
      ? Math.max(0, Math.min(1, r.opacity))
      : 1;
  const blend =
    typeof r.blend_mode === "string" &&
    COMPOSITOR_BLEND_MODES.has(r.blend_mode)
      ? r.blend_mode
      : "over";
  const visible = r.visible === undefined ? true : !!r.visible;
  return { opacity, blend_mode: blend, visible };
}

/**
 * Compositor — stacks multiple image layers with per-layer opacity and
 * blend mode. Dynamic image inputs are named `image_0`, `image_1`, ...;
 * the lowest-index input is the base (canvas), subsequent layers are
 * composited on top in index order at (0, 0). Per-layer state lives in
 * the `layers` list, indexed positionally against the sorted image
 * inputs. Hidden / zero-opacity layers are skipped.
 */
export class CompositorNode extends BaseNode {
  static readonly nodeType = "nodetool.image.Compositor";
  static readonly title = "Compositor";
  static readonly description =
    "Composite multiple image layers with per-layer opacity and blend mode.\n    image, compositor, blend, layers, mask";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly isDynamic = true;
  static readonly inlineFields = [];
  static readonly inputFields = [];

  @prop({
    type: "list",
    default: [],
    title: "Layers",
    description:
      "Per-layer state (positional): { opacity, blend_mode, visible }."
  })
  declare layers: unknown;

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

    // Build the canvas from the lowest-index visible layer. Apply its
    // opacity by scaling the alpha channel via `linear`.
    const buildScaledLayer = async (
      img: ImageRefLike,
      opacity: number
    ): Promise<Buffer> => {
      const bytes = await imageBytesAsync(img, context);
      let pipeline = sharp(bytes, { failOn: "none" }).ensureAlpha();
      if (opacity < 1) {
        pipeline = pipeline.linear([1, 1, 1, opacity], [0, 0, 0, 0]);
      }
      return pipeline.png().toBuffer();
    };

    let canvas = await buildScaledLayer(
      visible[0].image,
      visible[0].state.opacity
    );

    for (let i = 1; i < visible.length; i++) {
      const layer = visible[i];
      try {
        const layerBuf = await buildScaledLayer(layer.image, layer.state.opacity);
        canvas = await sharp(canvas, { failOn: "none" })
          .composite([
            {
              input: layerBuf,
              blend: layer.state.blend_mode as never,
              top: 0,
              left: 0
            }
          ])
          .png()
          .toBuffer();
      } catch (err) {
        // Bad input or unsupported blend → fall through, keep prior canvas.
        console.warn("CompositorNode: failed to composite layer, skipping.", err);
      }
    }

    const meta = await metadataFor(new Uint8Array(canvas));
    return {
      output: imageRef(new Uint8Array(canvas), {
        uri: "",
        mimeType: "image/png",
        width: meta.width,
        height: meta.height
      })
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
  static readonly inputFields = [];

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
      "Base64-encoded PNG of the painted alpha mask. Managed by the UI."
  })
  declare mask_data: unknown;

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
      // Fall back to a transparent canvas the size of the source image
      // (or 1×1 if dimensions are unknown).
      const w = Math.max(1, Number(image.width ?? 1));
      const h = Math.max(1, Number(image.height ?? 1));
      try {
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
        const meta = await metadataFor(new Uint8Array(blank));
        return {
          mask: imageRef(new Uint8Array(blank), {
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
      const out = await sharp(maskBytes, { failOn: "none" })
        .png()
        .toBuffer();
      const meta = await metadataFor(new Uint8Array(out));
      return {
        mask: imageRef(new Uint8Array(out), {
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

export const IMAGE_NODES = [
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  BatchToListNode,
  ImagesToListNode,
  PasteNode,
  ScaleNode,
  ResizeNode,
  CropNode,
  FitNode,
  RotateAndFlipNode,
  ChannelsNode,
  BlurNode,
  LevelsNode,
  TextToImageNode,
  ImageToImageNode,
  ImageEditorNode,
  CompositorNode,
  PainterNode
] as const;
