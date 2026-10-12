/**
 * Client helper for the game export endpoint:
 *   GET /api/games/:id/export-zip?target=web|tauri → the published revision as a web player or a Tauri desktop project
 */
import { restFetch } from "../lib/rest-fetch";
import { saveResponseAsFile } from "./downloadResponse";

export type GameExportTarget = "web" | "tauri";

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "game";
}

async function failureDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof parsed.detail === "string") { return parsed.detail; }
  } catch {
    // Not JSON: the text itself is the detail.
  }
  return text || `Export failed (${res.status})`;
}

/** Download a game's published revision as a zip of the web player or of the Tauri desktop app project. */
export async function exportGameZip(gameId: string, target: GameExportTarget, fallbackName: string): Promise<void> {
  const res = await restFetch(`/api/games/${encodeURIComponent(gameId)}/export-zip?target=${target}`, { method: "GET" });
  if (!res.ok) { throw new Error(await failureDetail(res)); }
  await saveResponseAsFile(res, `${sanitizeName(fallbackName)}-${target === "tauri" ? "desktop" : "web"}.zip`);
}
