import { spawn, type SpawnOptionsWithStdioTuple } from "node:child_process";
import { randomUUID } from "node:crypto";
import { GlobalFonts } from "@napi-rs/canvas";
import { missingRuntimePackageError } from "@nodetool-ai/protocol/missing-runtime-package";
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

async function validateExportMedia(bytes: Uint8Array, media: ExportMedia, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const label = media.kind === "audio" ? "Audio" : "Image";
  const input = media.kind === "audio" ? ["-f", media.format]
    : ["-f", "image2pipe", "-c:v", media.format === "jpeg" ? "mjpeg" : media.format];
  const output = media.kind === "audio" ? ["-map", "0:a:0", "-vn", "-sn", "-dn", "-f", "f32le"]
    : ["-map", "0:v:0", "-an", "-sn", "-dn", "-f", "rawvideo", "-pix_fmt", "rgba"];
  await new Promise<void>((resolve, reject) => {
    const spawnOptions: SpawnOptionsWithStdioTuple<"pipe", "pipe", "pipe"> = { stdio: ["pipe", "pipe", "pipe"] };
    if (signal) { spawnOptions.signal = signal; }
    const child = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-xerror", "-err_detect", "explode",
      "-threads", "1", "-protocol_whitelist", "pipe", ...input, "-i", "pipe:0", ...output, "-threads", "1", "pipe:1"], spawnOptions);
    let failure: Error | undefined;
    let diagnostic = "";
    let decodedBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => { decodedBytes += chunk.length; });
    child.stderr.on("data", (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString("utf8")).slice(-4096); });
    child.stdin.on("error", (cause: Error) => { failure ??= new Error(`${label} input could not be decoded`, { cause }); });
    child.on("error", (error: Error) => {
      failure = "code" in error && error.code === "ENOENT" ? missingRuntimePackageError("ffmpeg", "ffmpeg", error) : error;
    });
    child.on("close", (code) => {
      if (failure) { reject(failure); }
      else if (signal?.aborted) { reject(signal.reason); }
      else if (code !== 0 || diagnostic.trim() || decodedBytes === 0) {
        reject(new Error(`${label} could not be decoded (ffmpeg exit ${code}, ${decodedBytes} decoded bytes)${diagnostic ? `: ${diagnostic.trim()}` : ""}`));
      } else { resolve(); }
    });
    child.stdin.end(bytes);
  });
}
