// The value step of `nodetool.output.Output`, which the kernel runs natively
// (src/kernel/output_node.cpp) and hands media values to: OutputNode.process
// in packages/audio-nodes/src/nodes/output.ts normalizes the value through
// the context, then saves a media ref with bytes as an asset.

const MEDIA_EXTENSIONS = { image: ".png", audio: ".wav", video: ".mp4" };
const MEDIA_CONTENT_TYPES = { image: "image/png", audio: "audio/wav", video: "video/mp4" };

function inferMediaContentType(kind, bytes, uri) {
  const lower = (uri ?? "").toLowerCase();
  if (kind === "image") {
    if (bytes.length >= 4) {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
      if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
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

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/mp4": ".mp4"
};

async function persistMediaAsAsset(value, context, nodeId) {
  if (typeof context.createAsset !== "function" || context.persistOutputAssets === false) return value;
  if (value === null || typeof value !== "object") return value;
  const kind = typeof value.type === "string" ? value.type : "";
  if (!(kind in MEDIA_EXTENSIONS)) return value;
  if (typeof value.asset_id === "string" && value.asset_id.length > 0) return value;

  const { loadMediaRefBytes } = await import("./runtime.mjs");
  const bytes = (await loadMediaRefBytes(value, context)) ?? new Uint8Array();
  if (bytes.length === 0) return value;

  const uri = typeof value.uri === "string" ? value.uri : undefined;
  const contentType = inferMediaContentType(kind, bytes, uri);
  const ext = EXTENSIONS[contentType] ?? MEDIA_EXTENSIONS[kind];
  const asset = await context.createAsset({
    name: `${kind}-${Date.now()}${ext}`,
    contentType,
    content: bytes,
    nodeId
  });
  const assetId = asset && typeof asset.id === "string" ? asset.id : null;
  if (!assetId) return value;
  return { ...value, asset_id: assetId, uri: `asset://${assetId}${ext}` };
}

/** OutputNode.process after assign(): the value the node outputs. */
export async function outputValue(value, context, nodeId) {
  const normalized = typeof context.normalizeOutputValue === "function" ? await context.normalizeOutputValue(value) : value;
  return persistMediaAsAsset(normalized, context, nodeId);
}
