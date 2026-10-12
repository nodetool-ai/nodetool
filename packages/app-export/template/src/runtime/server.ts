/**
 * The calls the UI makes to its own server: run a workflow or script (streamed as
 * Server-Sent Events), upload a file a widget picked, and list the models the
 * configured providers offer.
 */

export type RunMessage = Record<string, unknown>;

export interface RunRequest {
  /** What to run: a workflow's or a script's key in `app.bundle.json`. */
  target: { workflow: string } | { script: string };
  params: Record<string, unknown>;
  jobId: string;
  signal: AbortSignal;
  onMessage: (message: RunMessage) => void;
}

/** Resolves when the server closes the stream; rejects on a transport error. */
export async function runOperation(request: RunRequest): Promise<void> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...request.target,
      params: request.params,
      job_id: request.jobId
    }),
    signal: request.signal
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Run failed (${response.status})`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) request.onMessage(JSON.parse(data) as RunMessage);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export type MediaKind = "image" | "audio" | "video" | "document" | "model_3d";

export interface MediaValue {
  type: MediaKind;
  uri: string;
  content_type?: string;
}

/** Store a file on the app's server and return the ref a workflow input reads. */
export async function uploadFile(kind: MediaKind, file: File): Promise<MediaValue> {
  const response = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file
  });
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")) || "Upload failed");
  }
  const body = (await response.json()) as { uri: string; content_type?: string };
  return { type: kind, uri: body.uri, content_type: body.content_type };
}

export interface ModelOption {
  type: string;
  provider?: string;
  id: string;
  name?: string;
  [key: string]: unknown;
}

const modelLists = new Map<string, Promise<ModelOption[]>>();

/** Models of one kind the server's providers offer; cached for the page's life. */
export function listModels(kind: string, task?: string): Promise<ModelOption[]> {
  const key = `${kind}:${task ?? ""}`;
  let pending = modelLists.get(key);
  if (!pending) {
    const query = new URLSearchParams({ kind, ...(task ? { task } : {}) });
    pending = fetch(`/api/models?${query.toString()}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ models?: ModelOption[] }>) : { models: [] }))
      .then((body) => (Array.isArray(body.models) ? body.models : []))
      .catch(() => {
        modelLists.delete(key);
        return [];
      });
    modelLists.set(key, pending);
  }
  return pending;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The URL a media value can be loaded from in this browser, or null. Refs that
 * point into a NodeTool install (`asset://`, `file://`, `memory://`) have no
 * meaning here, so they render as empty rather than as a broken element.
 * `package://` samples are served from the copies under assets/.
 */
export function mediaUrl(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value
      : isRecord(value)
        ? (value.uri ?? value.url)
        : null;
  if (typeof raw !== "string" || raw === "") return null;
  if (/^(https?:|data:|blob:)/.test(raw) || raw.startsWith("/api/storage/")) {
    return raw;
  }
  // Sample files the export copied under assets/.
  if (raw.startsWith("package://")) {
    return `/api/package-assets/${raw.slice("package://".length)}`;
  }
  return null;
}
