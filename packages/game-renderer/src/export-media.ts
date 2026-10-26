import { randomUUID } from "node:crypto";
import { GlobalFonts } from "@napi-rs/canvas";
import { verifyDecodes } from "@nodetool-ai/runtime/media";
import { inspectGameImageContainer } from "./renderer3d/assets/image-preparation.js";

/** Checks the container, then fully decodes its image stream without retaining pixels. */
export async function validateExportImage(bytes: Uint8Array, format: "png" | "jpeg" | "webp", signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const container = inspectGameImageContainer(bytes);
  if (container.format !== format) { throw new Error("Image content does not match its declared format"); }
  await validateExportMedia(bytes, { kind: "image", format }, signal);
}

/** Registers a font temporarily through the same decoder used by headless rendering. */
export function validateExportFont(bytes: Uint8Array, assetId: string, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  const key = GlobalFonts.register(Buffer.from(bytes), `ntg-export-check-${randomUUID()}`);
  if (!key) { throw new Error(`Invalid font bytes for ${assetId}`); }
  try { signal?.throwIfAborted(); }
  finally { GlobalFonts.remove(key); }
}

/** Fully decodes the selected audio stream without retaining its PCM output. */
export async function validateExportAudio(bytes: Uint8Array, format: "wav" | "ogg" | "mp3", signal?: AbortSignal): Promise<void> {
  await validateExportMedia(bytes, { kind: "audio", format }, signal);
}

type ExportMedia =
  | { readonly kind: "audio"; readonly format: "wav" | "ogg" | "mp3" }
  | { readonly kind: "image"; readonly format: "png" | "jpeg" | "webp" };

/** Decodes the whole stream with libav's strict error detection, in process. */
async function validateExportMedia(bytes: Uint8Array, media: ExportMedia, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const label = media.kind === "audio" ? "Audio" : "Image";
  try {
    await verifyDecodes(bytes, {
      kind: media.kind === "audio" ? "audio" : "video",
      format: media.kind === "audio" ? media.format : `${media.format}_pipe`,
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new Error(`${label} could not be decoded: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
