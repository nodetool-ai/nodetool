/**
 * Client helper for the storyboard archive endpoint:
 *   GET /api/storyboards/:id/export-zip → the board as Markdown + its media
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";
import { isObjectLike } from "./typePredicates";

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_") || "storyboard";
}

/**
 * What went wrong, in words: the `detail` of a JSON error body rather than the
 * body itself, which put `{"detail":"Not found"}` in front of people.
 */
async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (!body) {
    return `Download failed (${res.status})`;
  }
  try {
    const data: unknown = JSON.parse(body);
    if (isObjectLike(data) && "detail" in data) {
      return String(data.detail);
    }
  } catch {
    // Plain text: show it as it came.
  }
  return body;
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
    throw new Error(await errorText(res));
  }
  await saveResponseAsFile(res, `${sanitizeName(fallbackName)}.zip`);
}
