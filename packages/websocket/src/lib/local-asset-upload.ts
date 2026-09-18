import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getMaxLocalUploadBytes } from "@nodetool-ai/storage";
import { bridge } from "./bridge.js";
import {
  handleAssetsRoot,
  type HttpApiOptions,
  type StagedAssetUpload
} from "../http-api.js";

/** Stage multipart bytes on disk before publishing an asset. */
export async function handleLocalAssetUpload(
  request: FastifyRequest,
  reply: FastifyReply,
  options: HttpApiOptions
): Promise<void> {
  await bridge(request, reply, async (webRequest) => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-upload-"));
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.raw.once("aborted", abort);
    let metadata: unknown = {};
    let file: StagedAssetUpload["file"];
    try {
      for await (const part of request.parts({
        limits: {
          fileSize: getMaxLocalUploadBytes(),
          files: 1,
          fields: 2,
          parts: 3,
          fieldSize: 1024 * 1024
        }
      })) {
        if (part.type === "file") {
          if (part.fieldname !== "file") {
            part.file.resume();
            throw Object.assign(new Error("Expected multipart field 'file'"), { statusCode: 400 });
          }
          const path = join(directory, "upload");
          await pipeline(part.file, createWriteStream(path, { flags: "wx", mode: 0o600 }), {
            signal: controller.signal
          });
          if (part.file.truncated) {
            throw Object.assign(new Error("Upload exceeds maximum size"), { statusCode: 413 });
          }
          file = {
            path,
            name: part.filename,
            contentType: part.mimetype,
            size: (await stat(path)).size
          };
        } else if (part.fieldname === "json" || part.fieldname === "asset") {
          if (part.valueTruncated) {
            throw Object.assign(new Error("Asset metadata is too large"), { statusCode: 413 });
          }
          try {
            metadata = typeof part.value === "string" ? JSON.parse(part.value) : part.value;
          } catch {
            throw Object.assign(new Error("Invalid asset metadata JSON"), { statusCode: 400 });
          }
        }
      }
      controller.signal.throwIfAborted();
      const staged: StagedAssetUpload = file ? { metadata, file } : { metadata };
      return await handleAssetsRoot(webRequest, options, staged);
    } finally {
      request.raw.removeListener("aborted", abort);
      await rm(directory, { recursive: true, force: true });
    }
  }, options.userIdHeader);
}
