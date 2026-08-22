import { randomUUID } from "node:crypto";
import {
  sdkV1TemporaryAssetUpload,
  type SdkV1TemporaryAssetUpload
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { getMaxUploadBytes, type StorageAdapter } from "@nodetool-ai/storage";
import { getAssetFileName } from "../lib/asset-paths.js";
import { SdkV1ServiceError } from "./sdk-v1-service-error.js";

export interface SdkV1TemporaryAssetInput {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly name: string;
}

export interface SdkV1TemporaryAssetService {
  upload(input: SdkV1TemporaryAssetInput): Promise<SdkV1TemporaryAssetUpload>;
}

interface CreateSdkV1TemporaryAssetServiceOptions {
  readonly getStorage: () => StorageAdapter;
  readonly getConfiguredMaxUploadBytes?: () => number;
  readonly createId?: () => string;
}

export function createSdkV1TemporaryAssetService(
  options: CreateSdkV1TemporaryAssetServiceOptions
): SdkV1TemporaryAssetService {
  return {
    async upload(input) {
      const maxUploadBytes =
        options.getConfiguredMaxUploadBytes?.() ?? getMaxUploadBytes();
      if (input.bytes.byteLength > maxUploadBytes) {
        throw new SdkV1ServiceError(
          "payload-too-large",
          "UPLOAD_TOO_LARGE",
          `Upload exceeds the configured ${maxUploadBytes} byte limit`
        );
      }

      const mediaType = input.contentType || "application/octet-stream";
      const id = (options.createId ?? randomUUID)();
      const key = `temp/sdk-inputs/${getAssetFileName(id, mediaType)}`;
      const storedUri = await options
        .getStorage()
        .store(key, input.bytes, mediaType);
      const uri = storedUri.startsWith("file://")
        ? `/api/storage/${key}`
        : storedUri;
      return sdkV1TemporaryAssetUpload.parse({
        version: 1,
        uri,
        name: input.name || getAssetFileName(id, mediaType),
        content_type: mediaType,
        size: input.bytes.byteLength,
        expires_at: null
      });
    }
  };
}
