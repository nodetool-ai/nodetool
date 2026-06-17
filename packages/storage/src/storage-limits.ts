/**
 * Upload size guard shared by every storage backend (file, S3, Supabase) and
 * their adapters. Storage entry points accept caller-controlled `Uint8Array`
 * data; without a cap a single request can write an unbounded blob to disk,
 * a bucket, or memory. Each write path calls {@link assertUploadWithinLimit}
 * before touching the backend.
 */
import { getByteLimitEnv } from "@nodetool-ai/config";

/** Default maximum upload size: 1 GiB. */
const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/**
 * Maximum bytes accepted by a single storage upload. Override with the
 * `NODETOOL_MAX_UPLOAD_BYTES` environment variable (value in bytes).
 *
 * Read on each call so the limit honours late-loaded env files and is
 * overridable in tests.
 */
export function getMaxUploadBytes(): number {
  return getByteLimitEnv("NODETOOL_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES);
}

/**
 * Throw if `byteLength` exceeds the configured upload cap.
 *
 * @param key        Storage key, included in the error for diagnosis.
 * @param byteLength Size of the payload about to be written.
 */
export function assertUploadWithinLimit(key: string, byteLength: number): void {
  const max = getMaxUploadBytes();
  if (byteLength > max) {
    throw new Error(
      `Upload for key "${key}" exceeds maximum size: ${byteLength} > ${max} bytes ` +
        `(set NODETOOL_MAX_UPLOAD_BYTES to raise the limit)`
    );
  }
}
