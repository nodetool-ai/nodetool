import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";

/** The minimal asset shape needed to pick a workspace tab type. */
interface AssetLike {
  content_type?: string | null;
  name?: string | null;
}

/**
 * Map an asset's content type to the workspace tab type that can open it, or
 * `null` when no surface handles it (e.g. video, which only exists as a
 * timeline sequence, not a standalone asset tab).
 */
export const assetTabType = (asset: AssetLike): WorkspaceTabType | null => {
  const ct = asset.content_type ?? "";
  const name = (asset.name ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("text/") || ct === "application/json") return "text";
  if (
    ct.startsWith("model/") ||
    /\.(glb|gltf|obj|fbx|stl|ply|usdz)$/.test(name)
  ) {
    return "model3d";
  }
  return null;
};
