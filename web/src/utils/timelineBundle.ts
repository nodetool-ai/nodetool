/**
 * Client helpers for the timeline archive endpoints:
 *   GET  /api/timelines/:id/export-zip → the document + every referenced asset
 *   GET  /api/timelines/:id/export-premiere → a Premiere Pro XML + its media
 *   POST /api/timelines/import-zip     → a new timeline from such an archive
 */
import { restFetch } from "../lib/rest-fetch";
import type { RouterOutputs } from "../trpc/client";
import { saveResponseAsFile } from "./downloadResponse";
import { isObjectLike } from "./typePredicates";

type TimelineSequence = RouterOutputs["timeline"]["get"];

export interface ImportTimelineZipResponse {
  timeline: TimelineSequence;
  imported: number;
  missing: string[];
  checksum_mismatches: string[];
}

function isImportTimelineZipResponse(
  data: unknown
): data is ImportTimelineZipResponse {
  if (!isObjectLike(data)) return false;
  const timeline = (data as { timeline?: unknown }).timeline;
  return (
    isObjectLike(timeline) &&
    typeof (timeline as { id?: unknown }).id === "string" &&
    typeof (timeline as { name?: unknown }).name === "string"
  );
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "timeline";
}

/** Download one timeline as a zip of its document and asset bytes. */
export async function exportTimelineZip(
  timelineId: string,
  fallbackName: string
): Promise<void> {
  const res = await restFetch(
    `/api/timelines/${encodeURIComponent(timelineId)}/export-zip`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  await saveResponseAsFile(res, `${sanitizeName(fallbackName)}.zip`);
}

/**
 * Download one timeline as a zip holding a Final Cut Pro 7 XML sequence for
 * Adobe Premiere Pro and the media it uses. Resolves to how many clips the
 * export report flags, or null when the server did not say.
 */
export async function exportTimelinePremiere(
  timelineId: string,
  fallbackName: string
): Promise<number | null> {
  const res = await restFetch(
    `/api/timelines/${encodeURIComponent(timelineId)}/export-premiere`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Export failed (${res.status})`);
  }
  const warnings = Number.parseInt(
    res.headers.get("x-nodetool-export-warnings") ?? "",
    10
  );
  await saveResponseAsFile(res, `${sanitizeName(fallbackName)}-premiere.zip`);
  return Number.isFinite(warnings) ? warnings : null;
}

/** Upload a timeline zip; the server stores its assets and creates a timeline. */
export async function importTimelineZip(
  file: File,
  options: { projectId: string; name?: string }
): Promise<ImportTimelineZipResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", options.projectId);
  if (options.name) {
    formData.append("name", options.name);
  }
  const res = await restFetch("/api/timelines/import-zip", {
    method: "POST",
    body: formData
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      isObjectLike(data) && "detail" in data
        ? String(data.detail)
        : `Import failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isImportTimelineZipResponse(data)) {
    throw new Error("Unexpected response format from import endpoint");
  }
  return data;
}
