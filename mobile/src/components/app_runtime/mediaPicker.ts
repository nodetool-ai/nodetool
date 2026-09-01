/**
 * Producing a media value for a media input widget — by picking a file, or by
 * capturing one with the camera or the microphone.
 *
 * Files are uploaded so the workflow gets a URL the server can fetch; if the
 * upload fails the local URI is used, which still previews on device. A capture
 * goes through that same upload, so a recorder writes exactly what an upload
 * writes and one app document behaves the same on web and on the phone.
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

/** A file the device just produced: a camera clip, a finished recording. */
export interface CapturedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * What a capture attempt ended as. `denied` and `unavailable` carry the line the
 * widget shows: a permission the user turned down must be visible, not a button
 * that silently does nothing.
 */
export type CaptureResult =
  | { status: "captured"; value: MediaValue }
  | { status: "canceled" }
  | { status: "denied"; message: string }
  | { status: "unavailable"; message: string };

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

/**
 * Upload a captured file. The one path a capture and an upload share, so both
 * write the same `{type, uri, asset_id}`.
 */
export const uploadCapturedFile = (
  kind: MediaKind,
  file: CapturedFile
): Promise<MediaValue> => upload(kind, file.uri, file.name, file.mimeType);

/**
 * Record a clip with the camera and upload it.
 *
 * Permission follows `chat/ChatComposer.tsx`: request, and treat anything but
 * `granted` as a refusal the caller shows. A device with no usable camera makes
 * `launchCameraAsync` throw, which becomes `unavailable` rather than a crash —
 * either way the widget still offers the library.
 */
export const captureVideoValue = async (): Promise<CaptureResult> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      status: "denied",
      message: permission.canAskAgain
        ? "Camera access is needed to record. Allow it, or pick an existing clip."
        : "Camera access is off for NodeTool. Turn it on in Settings, or pick an existing clip.",
    };
  }

  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 0.8,
    });
    const shot = result.canceled ? undefined : result.assets[0];
    if (!shot) {
      return { status: "canceled" };
    }
    const fallback = DEFAULTS.video;
    return {
      status: "captured",
      value: await uploadCapturedFile("video", {
        uri: shot.uri,
        name: shot.fileName ?? `video_${Date.now()}${fallback.ext}`,
        mimeType: shot.mimeType ?? fallback.mime,
      }),
    };
  } catch (error) {
    console.error("Failed to record video:", error);
    return {
      status: "unavailable",
      message: "This device could not open the camera. Pick an existing clip instead.",
    };
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
