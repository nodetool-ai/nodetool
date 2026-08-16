/**
 * Picking a media value for a media input widget.
 *
 * Picked files are uploaded so the workflow gets a URL the server can fetch;
 * if the upload fails the local URI is used, which still previews on device.
 * Mirrors the media widgets in `graph_editor/PropertyField.tsx`.
 */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { apiService } from "../../services/api";

/**
 * `model_3d` matches the `Model3DRef` type tag a workflow's 3D input reads, so a
 * picked mesh needs no translation on the way into the graph.
 */
export type MediaKind = "image" | "audio" | "video" | "document" | "model_3d";

export interface MediaValue {
  type: MediaKind;
  uri: string;
  asset_id?: string;
}

const DEFAULTS = {
  image: { ext: ".jpg", mime: "image/jpeg" },
  audio: { ext: ".wav", mime: "audio/wav" },
  video: { ext: ".mp4", mime: "video/mp4" },
  document: { ext: ".pdf", mime: "application/pdf" },
  model_3d: { ext: ".glb", mime: "model/gltf-binary" },
} satisfies Record<MediaKind, { ext: string; mime: string }>;

const upload = async (
  kind: MediaKind,
  uri: string,
  name: string,
  mimeType: string
): Promise<MediaValue> => {
  try {
    const asset = await apiService.uploadAsset({
      uri,
      name,
      contentType: mimeType,
      parentId: "",
    });
    const ext = name.includes(".")
      ? name.slice(name.lastIndexOf("."))
      : DEFAULTS[kind].ext;
    return {
      type: kind,
      uri: `${apiService.getApiHost()}/api/storage/${asset.id}${ext}`,
      asset_id: asset.id,
    };
  } catch (error) {
    console.error(`Failed to upload ${kind}:`, error);
    return { type: kind, uri };
  }
};

/** Open the picker for a media kind. Resolves null when the user cancels. */
export const pickMediaValue = async (
  kind: MediaKind
): Promise<MediaValue | null> => {
  const fallback = DEFAULTS[kind];

  if (kind === "image" || kind === "video") {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    const picked = result.canceled ? undefined : result.assets[0];
    if (!picked) {return null;}
    return upload(
      kind,
      picked.uri,
      picked.fileName ?? `${kind}_${Date.now()}${fallback.ext}`,
      picked.mimeType ?? fallback.mime
    );
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: kind === "audio" ? "audio/*" : "*/*",
    copyToCacheDirectory: true,
  });
  const picked = result.canceled ? undefined : result.assets?.[0];
  if (!picked) {return null;}
  return upload(
    kind,
    picked.uri,
    picked.name ?? `${kind}_${Date.now()}${fallback.ext}`,
    picked.mimeType ?? fallback.mime
  );
};
