import type { Asset } from "../../stores/ApiTypes";

/** Extensions the 3D editor can load and export. */
const EDITABLE_EXTENSIONS = new Set(["glb", "gltf"]);

/** Extract a lowercased file extension from a name or URL (ignoring query/fragment). */
const extensionOf = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  let pathname = value;
  try {
    pathname = new URL(value, "http://localhost").pathname;
  } catch {
    pathname = value.split("?")[0].split("#")[0];
  }
  const base = pathname.toLowerCase().split("/").pop() ?? "";
  if (!base.includes(".")) {
    return undefined;
  }
  return base.split(".").pop();
};

/**
 * Detect assets the 3D editor can open (.glb/.gltf only).
 *
 * Checks the content type and BOTH the asset name and its download URL for an
 * extension — assets are often stored with a generic name and/or
 * `application/octet-stream` content type, with the real extension only on
 * `get_url`. This must stay in sync with the viewer detection in
 * `useAssetDisplay` so anything that renders as an editable model also exposes
 * the editor entry point.
 */
export const isEditableModel3DAsset = (asset: Asset): boolean => {
  const type = asset.content_type || "";
  if (type === "model/gltf-binary" || type === "model/gltf+json") {
    return true;
  }
  if (type.includes("gltf") || type.includes("glb")) {
    return true;
  }
  const ext = extensionOf(asset.name) ?? extensionOf(asset.get_url);
  return ext !== undefined && EDITABLE_EXTENSIONS.has(ext);
};
