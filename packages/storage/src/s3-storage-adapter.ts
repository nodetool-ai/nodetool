import {
  S3Client,
  type S3Api,
  type S3ClientOptions,
  type S3ListObjectsV2Input,
  type S3PutObjectInput
} from "./s3/client.js";
import type {
  DownloadUrlOptions,
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat,
  UploadTarget,
  UploadUrlOptions
} from "./storage-adapter.js";
import { assertUploadWithinLimit } from "./storage-limits.js";
import { joinStorageKey, normalizeStorageKey } from "./storage-keys.js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";

export interface S3StorageAdapterOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  /** Optional pre-built client (used by tests). */
  client?: S3Api;
}

/**
 * S3-backed storage adapter using the in-house SigV4 S3 client.
 *
 * URI scheme: `s3://<bucket>/<key>`.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly bucket: string;
  readonly prefix: string | null;
  private client: S3Api | null;
  private readonly region: string;
  private readonly endpoint: string | undefined;

  constructor(opts: S3StorageAdapterOptions) {
    if (!opts.bucket) {
      throw new Error("S3 bucket is required");
    }
    this.bucket = opts.bucket;
    this.prefix = opts.prefix ? normalizeStorageKey(opts.prefix) : null;
    this.region = opts.region ?? "us-east-1";
    this.endpoint = opts.endpoint;
    this.client = opts.client ?? null;
  }

  private getClient(): S3Api {
    if (this.client) return this.client;
    const options: S3ClientOptions = { region: this.region };
    if (this.endpoint) {
      options.endpoint = this.endpoint;
      options.forcePathStyle = true;
    }
    this.client = new S3Client(options);
    return this.client;
  }

  /**
   * Strip the adapter's bucket-side prefix from a raw S3 key, returning the key
   * relative to the adapter's logical root. A literal string strip — not a
   * RegExp — so a prefix containing regex metacharacters (`.`, `+`, `[`, …)
   * strips correctly instead of being interpreted as a pattern.
   */
  private stripPrefix(rawKey: string): string {
    if (!this.prefix) return rawKey;
    if (rawKey.startsWith(`${this.prefix}/`)) {
      return rawKey.slice(this.prefix.length + 1);
    }
    if (rawKey === this.prefix) return "";
    return rawKey;
  }

  private parseUri(uri: string): { bucket: string; key: string } | null {
    if (!uri.startsWith("s3://")) return null;
    const withoutScheme = uri.slice("s3://".length);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
      return null;
    }
    return {
      bucket: withoutScheme.slice(0, slashIndex),
      key: withoutScheme.slice(slashIndex + 1)
    };
  }

  async store(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string> {
    assertUploadWithinLimit(key, data.byteLength);
    const objectKey = joinStorageKey(this.prefix ?? undefined, key);
    // Transient-failure retries live in S3Client; no second retry layer here.
    try {
      const put: S3PutObjectInput = {
        bucket: this.bucket,
        key: objectKey,
        body: data
      };
      if (contentType) {
        put.contentType = contentType;
      }
      await this.getClient().putObject(put);
    } catch (err) {
      throw new Error(
        `S3 upload failed for s3://${this.bucket}/${objectKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err }
      );
    }
    return `s3://${this.bucket}/${objectKey}`;
  }

  uriForKey(key: string): string {
    const objectKey = joinStorageKey(this.prefix ?? undefined, key);
    return `s3://${this.bucket}/${objectKey}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    try {
      const { body } = await this.getClient().getObject({
        bucket: parsed.bucket,
        key: parsed.key
      });
      return body;
    } catch {
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return false;
    try {
      await this.getClient().headObject({
        bucket: parsed.bucket,
        key: parsed.key
      });
      return true;
    } catch {
      return false;
    }
  }

  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    const delimiter = opts.delimiter ?? undefined;
    const normalizedPrefix = prefix ? normalizeStorageKey(prefix) : "";
    // Always end the prefix with `/` when hierarchical, so S3 lists children
    // not the directory marker itself.
    const s3Prefix = joinStorageKey(this.prefix ?? undefined, normalizedPrefix);
    const s3PrefixWithSlash =
      delimiter && s3Prefix && !s3Prefix.endsWith("/")
        ? `${s3Prefix}/`
        : s3Prefix;

    const entries: StorageEntry[] = [];
    const commonPrefixes: string[] = [];

    let continuationToken: string | undefined = undefined;
    for (;;) {
      const listInput: S3ListObjectsV2Input = { bucket: this.bucket };
      if (s3PrefixWithSlash) {
        listInput.prefix = s3PrefixWithSlash;
      }
      if (delimiter) {
        listInput.delimiter = delimiter;
      }
      if (continuationToken) {
        listInput.continuationToken = continuationToken;
      }
      const response = await this.getClient().listObjectsV2(listInput);
      for (const obj of response.contents) {
        if (!obj.key) continue;
        // Strip the bucket-side prefix so callers see keys relative to the
        // adapter's logical root.
        const key = this.stripPrefix(obj.key);
        entries.push({
          key,
          uri: `s3://${this.bucket}/${obj.key}`,
          size: obj.size,
          modifiedAt: obj.lastModified?.getTime() ?? 0
        });
      }
      for (const cp of response.commonPrefixes) {
        if (!cp) continue;
        commonPrefixes.push(this.stripPrefix(cp));
      }
      if (!response.isTruncated || !response.nextContinuationToken) break;
      continuationToken = response.nextContinuationToken;
    }

    return {
      entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
      commonPrefixes: commonPrefixes.sort()
    };
  }

  async delete(uri: string): Promise<boolean> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return false;
    try {
      // Check existence first so we can return a meaningful boolean. S3
      // DeleteObject is otherwise idempotent and never errors on missing.
      await this.getClient().headObject({
        bucket: parsed.bucket,
        key: parsed.key
      });
    } catch {
      return false;
    }
    try {
      await this.getClient().deleteObject({
        bucket: parsed.bucket,
        key: parsed.key
      });
      return true;
    } catch {
      return false;
    }
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    try {
      const response = await this.getClient().headObject({
        bucket: parsed.bucket,
        key: parsed.key
      });
      const stat: StorageStat = {
        key: this.stripPrefix(parsed.key),
        size: response.contentLength,
        modifiedAt: response.lastModified?.getTime() ?? 0
      };
      if (response.contentType) {
        stat.contentType = response.contentType;
      }
      return stat;
    } catch {
      return null;
    }
  }

  /**
   * Presigned PUT for `key`, so a client uploads straight to S3. Returns
   * `null` when the injected client can't presign (test fakes). The URL
   * authorises a write to this one key; it does not bound the body, so the
   * caller must verify size and type after the upload lands.
   */
  async createUploadUrl(
    key: string,
    opts: UploadUrlOptions = {}
  ): Promise<UploadTarget | null> {
    const client = this.getClient();
    if (!client.presignPutObject) return null;
    const objectKey = joinStorageKey(this.prefix ?? undefined, key);
    const expiresIn = Math.min(opts.expiresIn ?? 3600, 604800);
    const url = await client.presignPutObject({
      bucket: this.bucket,
      key: objectKey,
      expiresIn
    });
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["content-type"] = opts.contentType;
    return {
      url,
      method: "PUT",
      headers,
      expiresAt: Date.now() + expiresIn * 1000
    };
  }

  /**
   * Presigned GET for `uri`, so a client reads the object without the bucket
   * being public. Returns `null` when the URI belongs to another bucket, the
   * injected client can't presign (test fakes), or signing throws.
   */
  async createDownloadUrl(
    uri: string,
    opts: DownloadUrlOptions = {}
  ): Promise<string | null> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    const client = this.getClient();
    if (!client.presignGetObject) return null;
    const expiresIn = Math.min(opts.expiresIn ?? SIGNED_URL_TTL, SIGNED_URL_TTL);
    try {
      return await client.presignGetObject({
        bucket: parsed.bucket,
        key: parsed.key,
        expiresIn
      });
    } catch {
      // Unsignable key (see S3Client.presignGetObject) — fall back to another
      // URL form rather than failing the run.
      return null;
    }
  }
}
