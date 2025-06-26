import { client } from "../stores/ApiClient";

/**
 * Ask the backend to open the given path in the user's file explorer.
 * Gracefully handles missing paths and logs any failures.
 *
 * @param path Absolute or user-specific path to open.
 */
export async function openInExplorer(path: string): Promise<void> {
  if (!path) {
    console.warn("[fileExplorer] Tried to open an empty path in explorer.");
    return;
  }

  try {
    await client.POST("/api/models/open_in_explorer", {
      params: { query: { path } }
    });
  } catch (error) {
    console.error("[fileExplorer] Failed to open path in explorer:", error);
  }
}
