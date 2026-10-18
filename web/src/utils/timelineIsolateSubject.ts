/**
 * Client for `POST /api/timelines/:id/isolate-subject` — the door the
 * inspector's "Isolate subject" button knocks on.
 *
 * The segmentation runs on the server against the STORED document and writes
 * the result onto the clip (`generatedMatte`, D2), so this only carries the
 * knobs there and reports what came back. The body is snake_case because it is
 * the capability's own input names minus `timeline_id`, which the path carries.
 */
import { restFetch } from "../lib/rest-fetch";
import { isObjectLike } from "./typePredicates";

export interface IsolateSubjectBody {
  clip_id: string;
  /** A provider that declares `matte_video`. */
  provider: string;
  /** A model that provider lists for `matte_video`. */
  model: string;
  /** Run the model again even when a matte covering this window exists. */
  regenerate?: boolean;
  /** Return as soon as the run is queued instead of waiting it out. */
  background?: boolean;
}

/**
 * What the route hands back: the `isolate_subject` capability's own outcome,
 * verbatim. It answers once the run has settled, so `generating` is only ever
 * seen by a caller that asked for a background run — which is why the store
 * still waits the document out when it sees one.
 */
export interface IsolateSubjectResult {
  status: "ready" | "generating" | "failed";
  /** The mask asset, once there is one. */
  assetId?: string;
  /** The generation row behind the run. */
  generationId?: string;
  sourceRange: { fromMs: number; toMs: number };
  costUsd?: number;
  /** True when a ready matte covered the window and nothing was run. */
  reused: boolean;
  /** The generation's own failure message, when `status` is `failed`. */
  error?: string;
}

function isIsolateSubjectResult(data: unknown): data is IsolateSubjectResult {
  if (!isObjectLike(data)) return false;
  const status = (data as { status?: unknown }).status;
  return (
    status === "ready" || status === "generating" || status === "failed"
  );
}

/** Ask the server to cut a matte from one clip's own source. */
export async function isolateSubject(
  timelineId: string,
  body: IsolateSubjectBody
): Promise<IsolateSubjectResult> {
  const res = await restFetch(
    `/api/timelines/${encodeURIComponent(timelineId)}/isolate-subject`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      isObjectLike(data) && "detail" in data
        ? String(data.detail)
        : `Isolate subject failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isIsolateSubjectResult(data)) {
    throw new Error("Unexpected response from the isolate-subject endpoint");
  }
  return data;
}
