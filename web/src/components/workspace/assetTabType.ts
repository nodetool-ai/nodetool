import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";
import { isTextAsset } from "../../utils/assetLanguage";

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
  // Before the image and text branches, both of which claim SVG: it is a raster
  // image to neither and editable markup to both, and its own surface shows the
  // rendered vector next to the source.
  if (ct === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  if (
    ct.startsWith("model/") ||
    /\.(glb|gltf|obj|fbx|stl|ply|usdz)$/.test(name)
  ) {
    return "model3d";
  }
  // Any text-based format (by extension or MIME) opens in the text editor.
  if (isTextAsset(asset)) return "text";
  return null;
};
