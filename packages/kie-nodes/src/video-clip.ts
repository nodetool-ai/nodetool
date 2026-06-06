import { isRefSet } from "./kie-base.js";

export const MAX_VIDEO_CLIP_SPAN = 10;

export interface VideoClipPayload {
  url: string;
  start: number;
  ends: number;
}

type VideoRefLike = Record<string, unknown>;

function readMetadata(item: VideoRefLike): Record<string, unknown> | null {
  const meta = item.metadata;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
}

function readNumericField(
  item: VideoRefLike,
  field: "clipStart" | "clipEnd"
): number | undefined {
  const meta = readMetadata(item);
  const direct = item[field];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  if (meta && typeof meta[field] === "number" && Number.isFinite(meta[field])) {
    return meta[field] as number;
  }
  return undefined;
}

export function readClipStart(item: unknown): number {
  if (!item || typeof item !== "object") {
    return 0;
  }
  const start = readNumericField(item as VideoRefLike, "clipStart");
  return start !== undefined ? Math.max(0, Math.floor(start)) : 0;
}

export function readClipEnd(item: unknown, start = readClipStart(item)): number {
  const duration =
    item && typeof item === "object"
      ? (item as VideoRefLike).duration
      : undefined;
  const fallbackDuration =
    typeof duration === "number" && duration > 0
      ? Math.min(duration, MAX_VIDEO_CLIP_SPAN)
      : MAX_VIDEO_CLIP_SPAN;

  const end = item && typeof item === "object"
    ? readNumericField(item as VideoRefLike, "clipEnd")
    : undefined;

  const resolvedEnd =
    end !== undefined ? Math.floor(end) : Math.floor(start + fallbackDuration);

  return clampClipEnd(start, resolvedEnd);
}

export function clampClipEnd(start: number, end: number): number {
  const minEnd = start + 1;
  const maxEnd = start + MAX_VIDEO_CLIP_SPAN;
  return Math.min(Math.max(end, minEnd), maxEnd);
}

export async function buildVideoClipsFromRefs(
  uploadVideo: (ref: unknown) => Promise<string>,
  value: unknown
): Promise<VideoClipPayload[]> {
  const items = Array.isArray(value) ? value : [];
  const clips: VideoClipPayload[] = [];

  for (const item of items) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { url?: unknown }).url === "string" &&
      (item as { url: string }).url
    ) {
      const clip = item as { url: string; start?: number; ends?: number };
      const start = typeof clip.start === "number" ? clip.start : 0;
      clips.push({
        url: clip.url,
        start,
        ends:
          typeof clip.ends === "number"
            ? clampClipEnd(start, clip.ends)
            : readClipEnd(item, start)
      });
      continue;
    }

    if (isRefSet(item)) {
      const url = await uploadVideo(item);
      const start = readClipStart(item);
      clips.push({ url, start, ends: readClipEnd(item, start) });
    }
  }

  return clips;
}
