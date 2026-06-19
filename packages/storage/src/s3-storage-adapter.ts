import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput
} from "@aws-sdk/client-s3";
import type {
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat
} from "./storage-adapter.js";
import { assertUploadWithinLimit } from "./storage-limits.js";
import { joinStorageKey, normalizeStorageKey } from "./storage-keys.js";

export interface S3StorageAdapterOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  /** Optional pre-built client (used by tests). */
  client?: S3Client;
}

/**
 * S3-backed storage adapter using `@aws-sdk/client-s3`.
 *
 * URI scheme: `s3://<bucket>/<key>`.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly bucket: string;
  readonly prefix: string | null;
  private client: S3Client | null;
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

  private getClient(): S3Client {
    if (this.client) return this.client;
    const config: Record<string, unknown> = { region: this.region };
    if (this.endpoint) {
      config.endpoint = this.endpoint;
      config.forcePathStyle = true;
    }
    this.client = new S3Client(config);
    return this.client;
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
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: data,
        ...(contentType ? { ContentType: contentType } : {})
      })
    );
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
      const response = await this.getClient().send(
        new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
      const body = response.Body as
        | { transformToByteArray?: () => Promise<Uint8Array> }
        | AsyncIterable<Uint8Array>
        | null
        | undefined;
      if (!body) return null;
      if (
        typeof (body as { transformToByteArray?: unknown })
          .transformToByteArray === "function"
      ) {
        return await (
          body as { transformToByteArray: () => Promise<Uint8Array> }
        ).transformToByteArray();
      }
      const chunks: Uint8Array[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    } catch {
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return false;
    try {
      await this.getClient().send(
        new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
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
    const s3PrefixWithSlash = delimiter && s3Prefix && !s3Prefix.endsWith("/")
      ? `${s3Prefix}/`
      : s3Prefix;

    const entries: StorageEntry[] = [];
    const commonPrefixes: string[] = [];

    let continuationToken: string | undefined = undefined;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: ListObjectsV2CommandOutput = await this.getClient().send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: s3PrefixWithSlash || undefined,
          Delimiter: delimiter,
          ContinuationToken: continuationToken
        })
      );
      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue;
        // Strip the bucket-side prefix so callers see keys relative to the
        // adapter's logical root.
        const key = this.prefix
          ? obj.Key.replace(new RegExp(`^${this.prefix}/?`), "")
          : obj.Key;
        entries.push({
          key,
          uri: `s3://${this.bucket}/${obj.Key}`,
          size: obj.Size ?? 0,
          modifiedAt: obj.LastModified?.getTime() ?? 0
        });
      }
      for (const cp of response.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue;
        const stripped = this.prefix
          ? cp.Prefix.replace(new RegExp(`^${this.prefix}/?`), "")
          : cp.Prefix;
        commonPrefixes.push(stripped);
      }
      if (!response.IsTruncated || !response.NextContinuationToken) break;
      continuationToken = response.NextContinuationToken;
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
      await this.getClient().send(
        new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
    } catch {
      return false;
    }
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
      return true;
    } catch {
      return false;
    }
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    try {
      const response = await this.getClient().send(
        new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
      const stripped = this.prefix
        ? parsed.key.replace(new RegExp(`^${this.prefix}/?`), "")
        : parsed.key;
      return {
        key: stripped,
        size: response.ContentLength ?? 0,
        modifiedAt: response.LastModified?.getTime() ?? 0,
        ...(response.ContentType ? { contentType: response.ContentType } : {})
      };
    } catch {
      return null;
    }
  }
}
