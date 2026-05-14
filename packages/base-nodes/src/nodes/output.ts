import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { audioBytesAsync } from "../lib/audio-wav.js";

const MEDIA_EXTENSIONS: Record<string, string> = {
  image: ".png",
  audio: ".wav",
  video: ".mp4"
};

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4"
};

function inferMediaContentType(
  kind: string,
  bytes: Uint8Array,
  uri: string | undefined
): string {
  const lower = (uri ?? "").toLowerCase();
  if (kind === "image") {
    if (bytes.length >= 4) {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
      if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      )
        return "image/png";
      if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
      if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[8] === 0x57
      )
        return "image/webp";
    }
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
  }
  if (kind === "audio") {
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".ogg")) return "audio/ogg";
  }
  if (kind === "video") {
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mov")) return "video/quicktime";
  }
  return MEDIA_CONTENT_TYPES[kind] ?? "application/octet-stream";
}

function extensionFor(contentType: string, fallback: string): string {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/gif") return ".gif";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "audio/mpeg") return ".mp3";
  if (contentType === "audio/ogg") return ".ogg";
  if (contentType === "audio/wav") return ".wav";
  if (contentType === "video/webm") return ".webm";
  if (contentType === "video/quicktime") return ".mov";
  if (contentType === "video/mp4") return ".mp4";
  return fallback;
}

async function persistMediaAsAsset(
  value: unknown,
  context: ProcessingContext,
  nodeId: string | null
): Promise<unknown> {
  if (typeof context.createAsset !== "function") return value;
  if (!value || typeof value !== "object") return value;
  const ref = value as Record<string, unknown>;
  const kind = typeof ref.type === "string" ? ref.type : "";
  if (!(kind in MEDIA_EXTENSIONS)) return value;
  if (typeof ref.asset_id === "string" && ref.asset_id) return value;

  const bytes = await audioBytesAsync(ref, context);
  if (bytes.length === 0) return value;

  const uri = typeof ref.uri === "string" ? ref.uri : undefined;
  const contentType = inferMediaContentType(kind, bytes, uri);
  const ext = extensionFor(contentType, MEDIA_EXTENSIONS[kind]!);
  const name = `${kind}-${Date.now()}${ext}`;

  const asset = (await context.createAsset({
    name,
    contentType,
    content: bytes,
    nodeId
  })) as Record<string, unknown> | null;
  const assetId =
    asset && typeof asset.id === "string" ? (asset.id as string) : null;
  if (!assetId) return value;

  return {
    ...ref,
    asset_id: assetId,
    uri: `asset://${assetId}${ext}`
  };
}

export class OutputNode extends BaseNode {
  static readonly nodeType = "nodetool.output.Output";
  static readonly title = "Output";
  static readonly description =
    "Generic output node for any type.\n    output, result, sink, return";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["value"];

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The parameter name for the workflow."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "The value of the output."
  })
  declare value: any;

  @prop({
    type: "str",
    default: "",
    title: "Description",
    description: "The description of the output for the workflow."
  })
  declare description: any;

  private async normalize(
    value: unknown,
    context?: ProcessingContext
  ): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function")
      return value;
    return context.normalizeOutputValue(value);
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const value = this.value ?? null;

    const normalized = await this.normalize(value, context);
    const persisted = context
      ? await persistMediaAsAsset(
          normalized,
          context,
          this.__node_id ? String(this.__node_id) : null
        )
      : normalized;
    return { output: persisted };
  }
}

export class PreviewNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.base_node.Preview";
  static readonly title = "Preview";
  static readonly description = "Preview values inside the workflow graph";
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["value"];

  @prop({ type: "any", default: null })
  declare value: any;

  @prop({ type: "str", default: "" })
  declare name: any;

  private async normalize(
    value: unknown,
    context?: ProcessingContext
  ): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function")
      return value;
    return context.normalizeOutputValue(value);
  }

  private emitPreview(value: unknown, context?: ProcessingContext): void {
    if (!context || typeof context.emit !== "function") return;
    const nodeId = String(
      this.__node_id ?? this.name ?? this.__node_name ?? ""
    );
    context.emit({
      type: "preview_update",
      node_id: nodeId,
      value
    });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const value = this.value ?? null;

    const normalized = await this.normalize(value, context);
    this.emitPreview(normalized, context);
    return { output: normalized };
  }
}

export const OUTPUT_NODES = [OutputNode, PreviewNode] as const;
