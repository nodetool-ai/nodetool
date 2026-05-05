/**
 * Typed REST client for the /api/timeline endpoints.
 *
 * Uses the Web fetch API. All functions throw on HTTP errors.
 */

const BASE = "/api/timeline";

// ── Response types (mirrors @nodetool-ai/timeline types) ────────────────────

export interface ClipVersion {
  id: string;
  createdAt: string;
  jobId: string;
  assetId: string;
  workflowUpdatedAt: string;
  dependencyHash: string;
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "overlay" | "subtitle";
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  solo?: boolean;
  heightPx?: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  mediaType: "image" | "video" | "audio" | "overlay";
  sourceType: "imported" | "generated";
  status: string;
  locked: boolean;
  versions: ClipVersion[];
  [key: string]: unknown;
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  color?: string;
  note?: string;
}

export interface TimelineDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
}

export interface TimelineSequence {
  id: string;
  projectId: string;
  workflowId?: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineSequenceListItem {
  id: string;
  projectId: string;
  name: string;
  updatedAt: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface CreateTimelineRequest {
  name: string;
  projectId: string;
  fps?: number;
  width?: number;
  height?: number;
}

export interface PatchTimelineRequest {
  name?: string;
  fps?: number;
  width?: number;
  height?: number;
  document?: TimelineDocument;
}

export interface AppendClipVersionRequest {
  jobId: string;
  assetId: string;
  dependencyHash: string;
  workflowUpdatedAt: string;
  paramOverridesSnapshot?: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status?: "success" | "failed" | "cancelled";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const err = new Error(
      (body as { detail?: string }).detail ?? `HTTP ${res.status}`
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

// ── API functions ────────────────────────────────────────────────────────────

export async function listTimelines(
  projectId?: string
): Promise<TimelineSequenceListItem[]> {
  const url = projectId ? `${BASE}?projectId=${encodeURIComponent(projectId)}` : BASE;
  const res = await fetch(url);
  return handleResponse<TimelineSequenceListItem[]>(res);
}

export async function getTimeline(id: string): Promise<TimelineSequence> {
  const res = await fetch(`${BASE}/${id}`);
  return handleResponse<TimelineSequence>(res);
}

export async function createTimeline(
  body: CreateTimelineRequest
): Promise<TimelineSequence> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return handleResponse<TimelineSequence>(res);
}

export async function patchTimeline(
  id: string,
  body: PatchTimelineRequest,
  options?: { ifMatch?: string }
): Promise<TimelineSequence> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (options?.ifMatch) {
    headers["If-Match"] = options.ifMatch;
  }
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  });
  return handleResponse<TimelineSequence>(res);
}

export async function deleteTimeline(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  return handleResponse<void>(res);
}

export async function getClipVersions(
  sequenceId: string,
  clipId: string
): Promise<ClipVersion[]> {
  const res = await fetch(`${BASE}/${sequenceId}/clips/${clipId}/versions`);
  return handleResponse<ClipVersion[]>(res);
}

export async function appendClipVersion(
  sequenceId: string,
  clipId: string,
  body: AppendClipVersionRequest
): Promise<ClipVersion> {
  const res = await fetch(`${BASE}/${sequenceId}/clips/${clipId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return handleResponse<ClipVersion>(res);
}
