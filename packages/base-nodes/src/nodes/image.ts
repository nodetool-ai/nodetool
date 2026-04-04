import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ImageRef } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import path from "node:path";
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
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function imageBytes(image: unknown): Uint8Array {
  if (!image || typeof image !== "object") return new Uint8Array();
  return toBytes((image as ImageRefLike).data);
}

async function imageBytesAsync(image: unknown): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const ref = image as ImageRefLike;
  if (ref.data) return toBytes(ref.data);
  if (typeof ref.uri === "string" && ref.uri) {
    if (ref.uri.startsWith("file://")) {
      return new Uint8Array(await fs.readFile(filePath(ref.uri)));
    }
    const response = await fetch(ref.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array();
}

function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
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
  operation: (instance: sharp.Sharp, bytes: Uint8Array) => sharp.Sharp
): Promise<Record<string, unknown>> {
  const bytes = await imageBytesAsync(image);
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
    path: "str"
  };

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
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext))
        continue;
      const full = path.join(folder, entry.name);
      const data = new Uint8Array(await fs.readFile(full));
      const meta = await metadataFor(data);
      yield {
        image: imageRef(data, {
          uri: `file://${full}`,
          mimeType: inferImageMime(full, data),
          width: meta.width,
          height: meta.height
        }),
        name: entry.name
      };
    }
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
    const p = filePath(path.resolve(folder, filename));
    await fs.mkdir(path.dirname(p), { recursive: true });
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
    name: "str"
  };

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
    return {};
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
    const bytes = await imageBytesAsync(this.image);
    if (bytes.length === 0) throw new Error("The input image is not connected.");

    const name = dateName(String(this.name ?? "image.png"));
    const mime = inferImageMime(undefined, bytes);
    const meta = await metadataFor(bytes);

    // Use context to create an asset if available
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const bytes = await imageBytesAsync(image);
    const meta = await metadataFor(bytes);
    return {
      output: {
        uri: image.uri ?? "",
        mime_type: image.mimeType ?? inferImageMime(image.uri, bytes),
        size_bytes: bytes.length,
        width: image.width ?? meta.width,
        height: image.height ?? meta.height
      }
    };
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
    const batch = this.batch ?? [];
    if (Array.isArray(batch)) return { output: batch };
    return { output: [batch] };
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

  async process(): Promise<Record<string, unknown>> {
    const images = this.getDynamic("images");
    const explicit = Array.isArray(images) ? (images as unknown[]) : [];
    const out = [...explicit];
    const a = this.getDynamic("image_a");
    const b = this.getDynamic("image_b");
    if (a) out.push(a);
    if (b) out.push(b);
    return { output: out };
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const paste = (this.paste ?? {}) as ImageRefLike;
    const left = Math.max(0, Number(this.left ?? 0));
    const top = Math.max(0, Number(this.top ?? 0));
    const baseBytes = await imageBytesAsync(image);
    const overlayBytes = await imageBytesAsync(paste);

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

  async process(): Promise<Record<string, unknown>> {
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
    })) as Record<string, unknown>;
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const width = Number(this.width ?? image.width ?? 0) || null;
    const height = Number(this.height ?? image.height ?? 0) || null;
    const output = (await transformImage(image, (instance) =>
      instance.resize(width ?? undefined, height ?? undefined)
    )) as Record<string, unknown>;
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const left = Math.max(0, Number(this.left ?? 0));
    const top = Math.max(0, Number(this.top ?? 0));
    const right = Number(this.right ?? image.width ?? 0);
    const bottom = Number(this.bottom ?? image.height ?? 0);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const output = (await transformImage(image, (instance) =>
      instance.extract({ left, top, width, height })
    )) as Record<string, unknown>;
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const width = Math.max(1, Number(this.width ?? image.width ?? 512));
    const height = Math.max(1, Number(this.height ?? image.height ?? 512));
    const output = (await transformImage(image, (instance) =>
      instance.resize(width, height, { fit: "cover", position: "centre" })
    )) as Record<string, unknown>;
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
  static readonly basicFields = ["model", "prompt", "width", "height", "seed"];
  static readonly exposeAsTool = true;

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
    type: "int",
    default: 512,
    title: "Width",
    description: "Width of the generated image",
    min: 64,
    max: 2048
  })
  declare width: any;

  @prop({
    type: "int",
    default: 512,
    title: "Height",
    description: "Height of the generated image",
    min: 64,
    max: 2048
  })
  declare height: any;

  @prop({
    type: "float",
    default: 7.5,
    title: "Guidance Scale",
    description: "Classifier-free guidance scale (higher = closer to prompt)",
    min: 0,
    max: 30
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 30,
    title: "Num Inference Steps",
    description: "Number of denoising steps",
    min: 1,
    max: 100
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducibility (-1 for random)",
    min: -1
  })
  declare seed: any;

  @prop({
    type: "bool",
    default: true,
    title: "Safety Check",
    description: "Enable safety checker to filter inappropriate content"
  })
  declare safety_check: any;

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
    const width = Number(this.width ?? 512);
    const height = Number(this.height ?? 512);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const output = (await context.runProviderPrediction({
        provider: providerId,
        capability: "text_to_image",
        model: modelId,
        params: {
          prompt,
          width,
          height,
          negative_prompt: this.negative_prompt,
          quality: (this as any).quality
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
    const bytes = Uint8Array.from(Buffer.from(prompt, "utf8"));
    return {
      output: imageRef(bytes, {
        width,
        height
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
  static readonly basicFields = [
    "model",
    "image",
    "prompt",
    "strength",
    "seed"
  ];
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
    default: 0.8,
    title: "Strength",
    description:
      "How much to transform the input image (0.0 = no change, 1.0 = maximum change)",
    min: 0,
    max: 1
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 7.5,
    title: "Guidance Scale",
    description: "Classifier-free guidance scale",
    min: 0,
    max: 30
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 30,
    title: "Num Inference Steps",
    description: "Number of denoising steps",
    min: 1,
    max: 100
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: 512,
    title: "Target Width",
    description: "Target width of the output image",
    min: 64,
    max: 2048
  })
  declare target_width: any;

  @prop({
    type: "int",
    default: 512,
    title: "Target Height",
    description: "Target height of the output image",
    min: 64,
    max: 2048
  })
  declare target_height: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducibility (-1 for random)",
    min: -1
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    title: "Scheduler",
    description: "Scheduler to use (provider-specific)"
  })
  declare scheduler: any;

  @prop({
    type: "bool",
    default: true,
    title: "Safety Check",
    description: "Enable safety checker"
  })
  declare safety_check: any;

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
    const bytes = await imageBytesAsync(image);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const output = (await context.runProviderPrediction({
        provider: providerId,
        capability: "image_to_image",
        model: modelId,
        params: {
          image: bytes,
          prompt: String(this.prompt ?? ""),
          negative_prompt: this.negative_prompt,
          target_width: this.target_width,
          target_height: this.target_height,
          quality: (this as any).quality
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
    return {
      output: imageRef(bytes, {
        uri: image.uri ?? ""
      })
    };
  }
}

export class RotateNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Rotate";
  static readonly title = "Rotate";
  static readonly description =
    "Rotate an image by a specified angle in degrees.\n    image, rotate, angle, transform, orientation";
  static readonly metadataOutputTypes = {
    output: "image"
  };

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
    description: "The image to rotate."
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

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const angle = Number(this.angle ?? 0);
    if (angle === 0) {
      const bytes = await imageBytesAsync(image);
      return {
        output: imageRef(bytes, {
          uri: image.uri ?? "",
          width: image.width ?? undefined,
          height: image.height ?? undefined
        })
      };
    }
    return transformImage(image, (instance) =>
      instance.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    );
  }
}

export class FlipNode extends TransformImageNode {
  static readonly nodeType = "nodetool.image.Flip";
  static readonly title = "Flip";
  static readonly description =
    "Flip an image horizontally or vertically.\n    image, flip, mirror, horizontal, vertical, transform";
  static readonly metadataOutputTypes = {
    output: "image"
  };

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
    description: "The image to flip."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "horizontal",
    title: "Direction",
    description: "Flip direction.",
    values: ["horizontal", "vertical"]
  })
  declare direction: any;

  async process(): Promise<Record<string, unknown>> {
    const image = (this.image ?? {}) as ImageRefLike;
    const direction = String(this.direction ?? "horizontal");
    return transformImage(image, (instance) =>
      direction === "vertical" ? instance.flip() : instance.flop()
    );
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
  RotateNode,
  FlipNode,
  TextToImageNode,
  ImageToImageNode
] as const;
