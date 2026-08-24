/**
 * Client helper for the storyboard archive endpoint:
 *   GET /api/storyboards/:id/export-zip → the board as Markdown + its media
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "storyboard";
}

/** Download one storyboard as a zip of Markdown, stills, and clips. */
export async function exportStoryboardZip(
  storyboardId: string,
  fallbackName: string
): Promise<void> {
  const res = await restFetch(
    `/api/storyboards/${encodeURIComponent(storyboardId)}/export-zip`,
    { method: "GET" }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Download failed (${res.status})`);
  }
  await saveResponseAsFile(res, `${sanitizeName(fallbackName)}.zip`);
}
