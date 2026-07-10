/**
 * Factory that returns a (key → signed URL) function for each storage backend.
 *
 * - file:     returns /api/storage/<key> — served by the local HTTP server,
 *             no signing needed for local dev.
 * - s3:       returns an AWS pre-signed GET URL valid for SIGNED_URL_TTL seconds.
 * - supabase: returns a Supabase signed URL valid for SIGNED_URL_TTL seconds.
 */

import { S3Client } from "./s3/client.js";
import { createClient } from "@supabase/supabase-js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";
import type { StorageConfig } from "./factory.js";

export function createAssetUrlBuilder(
  config: StorageConfig
): (key: string) => Promise<string> {
  switch (config.kind) {
    case "file": {
      return async (key: string) =>
        `/api/storage/${key.replace(/^\/+/, "")}`;
    }

    case "s3": {
      const client = new S3Client({
        region: config.region ?? "us-east-1",
        ...(config.endpoint
          ? { endpoint: config.endpoint, forcePathStyle: true }
          : {})
      });
      const bucket = config.bucket;
      return async (key: string) =>
        client.presignGetObject({ bucket, key, expiresIn: SIGNED_URL_TTL });
    }

    case "supabase": {
      const supabase = createClient(config.url, config.apiKey);
      const bucket = config.bucket;
      return async (key: string) => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(key, SIGNED_URL_TTL);
        if (error || !data) {
          throw new Error(
            `Failed to create signed URL for "${key}": ${error?.message ?? "no data"}`
          );
        }
        return data.signedUrl;
      };
    }
  }
}
