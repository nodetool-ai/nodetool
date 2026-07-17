import type { ProcessingContext } from "@nodetool-ai/runtime";

export type ImageRefLike = {
  data?: string | Uint8Array;
  uri?: string;
  asset_id?: string | null;
  type?: string;
  [k: string]: unknown;
};

const ASSET_EXTENSIONS: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "webp"],
  audio: ["mp3", "wav", "ogg"],
  video: ["mp4", "webm"]
};

export async function decodeImage(
  ref: unknown,
  context?: ProcessingContext
): Promise<Buffer | null> {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as ImageRefLike;

  // Inline data (base64 or Uint8Array)
  if (r.data) {
    if (r.data instanceof Uint8Array) return Buffer.from(r.data);
    if (typeof r.data === "string") return Buffer.from(r.data, "base64");
  }

  // Resolve from storage via asset_id or uri
  if (context?.storage) {
    const candidates: string[] = [];
    if (r.uri) candidates.push(r.uri);
    if (r.asset_id) {
      const exts = ASSET_EXTENSIONS[(r.type ?? "image").toLowerCase()] ?? [
        "png"
      ];
      for (const ext of exts) {
        candidates.push(`/api/storage/${r.asset_id}.${ext}`);
      }
    }
    for (const candidate of candidates) {
      const stored = await context.storage.retrieve(candidate);
      if (stored !== null) {
        return Buffer.from(stored);
      }
    }
  }

  return null;
}

export function pickImage(
  inputs: Record<string, unknown>,
  props: Record<string, unknown>
): unknown {
  const keys = [
    "image",
    "input",
    "source",
    "foreground",
    "background",
    "image1",
    "image2",
    "base_image",
    "mask"
  ];
  for (const key of keys) {
    if (key in inputs) return inputs[key];
  }
  for (const key of keys) {
    if (key in props) return props[key];
  }
  return null;
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number
): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    case 5:
      return [v, p, q];
    default:
      return [0, 0, 0];
  }
}
