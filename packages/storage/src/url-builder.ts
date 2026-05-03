/**
 * Factory that returns a (key → signed URL) function for each storage backend.
 *
 * - file:     returns /api/storage/<key> — served by the local HTTP server,
 *             no signing needed for local dev.
 * - s3:       returns an AWS pre-signed GET URL valid for SIGNED_URL_TTL seconds.
 * - supabase: returns a Supabase signed URL valid for SIGNED_URL_TTL seconds.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import type { StorageConfig } from "./factory.js";

/** 7 days — S3/Supabase maximum. */
const SIGNED_URL_TTL = 604800;

export function createAssetUrlBuilder(
  config: StorageConfig
): (key: string) => Promise<string> {
  switch (config.kind) {
    case "file": {
      return async (key: string) =>
        `/api/storage/${key.replace(/^\/+/, "")}`;
    }

    case "s3": {
      const clientConfig: Record<string, unknown> = {
        region: config.region ?? "us-east-1"
      };
      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
        clientConfig.forcePathStyle = true;
      }
      const client = new S3Client(clientConfig);
      const bucket = config.bucket;
      return async (key: string) => {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL });
      };
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
