import { randomUUID } from "node:crypto";
import {
  S3Client,
  S3Error,
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
import {
  compareStorageKeys,
  joinStorageKey,
  normalizeStorageKey
} from "./storage-keys.js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";
import { objectCacheControl } from "./cache-control.js";

/**
 * The endpoint answered a conditional put (`If-None-Match: *`) over an
 * existing object by replacing it. It does not honor the header, so it cannot
 * create a file without replacing one.
 */
export class ConditionalWriteUnsupportedError extends Error {
  constructor(endpoint: string) {
    super(
      `The storage endpoint ${endpoint} ignores the If-None-Match header on writes, so NodeTool cannot create a file there without risking the replacement of another one. ` +
        "Use storage that supports conditional writes (AWS S3, Cloudflare R2, current MinIO), or a local project folder."
    );
    this.name = "ConditionalWriteUnsupportedError";
  }
}

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
  /**
   * The one probe of whether the endpoint honors `If-None-Match`. A probe that
   * failed for another reason is dropped, so the next write tries again.
   */
  private conditionalWrites: Promise<void> | null = null;

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
        body: data,
        cacheControl: objectCacheControl()
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

  /**
   * Prove once per adapter that the endpoint honors `If-None-Match: *`. Some
   * S3-compatible stores accept the header and ignore it, and a write through
   * one of them silently replaces the object. The probe puts a scratch object
   * twice, the second time conditionally. The second put must be refused. It
   * throws {@link ConditionalWriteUnsupportedError} when it is not, and the
   * answer is kept, so every later write is refused without another request.
   */
  private requireConditionalWrites(): Promise<void> {
    this.conditionalWrites ??= this.probeConditionalWrites().catch(
      (error: unknown) => {
        // An unsupported endpoint stays unsupported. Anything else (a network
        // error, a denied put) says nothing about the header, so it is tried
        // again on the next write.
        if (!(error instanceof ConditionalWriteUnsupportedError)) {
          this.conditionalWrites = null;
        }
        throw error;
      }
    );
    return this.conditionalWrites;
  }

  private async probeConditionalWrites(): Promise<void> {
    const client = this.getClient();
    const key = joinStorageKey(
      this.prefix ?? undefined,
      `.storage-probe/${randomUUID()}`
    );
    const put = (ifNoneMatch?: string): Promise<unknown> =>
      client.putObject({
        bucket: this.bucket,
        key,
        body: new Uint8Array(0),
        ...(ifNoneMatch ? { ifNoneMatch } : {})
      });
    let honored = false;
    try {
      await put();
      try {
        await put("*");
      } catch (error) {
        if (
          error instanceof S3Error &&
          (error.statusCode === 412 || error.statusCode === 409)
        ) {
          honored = true;
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof ConditionalWriteUnsupportedError) throw error;
      throw new Error(
        `S3 conditional-write probe failed for s3://${this.bucket}/${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    } finally {
      try {
        await client.deleteObject({ bucket: this.bucket, key });
      } catch {
        // A scratch object that cannot be removed does not change the answer.
        // It sits in a directory of its own, outside every project file.
      }
    }
    if (!honored) {
      throw new ConditionalWriteUnsupportedError(
        this.endpoint ?? `s3://${this.bucket}`
      );
    }
  }

  /**
   * A conditional put (`If-None-Match: *`). The store refuses it with 412
   * when an object exists, and with 409 when another conditional put for the
   * key is in flight. Both mean the key is taken. The endpoint must support
   * conditional writes: AWS S3, Cloudflare R2 and current MinIO do. The first
   * call probes the endpoint, and an endpoint that ignores the header is
   * refused with {@link ConditionalWriteUnsupportedError} before any file is
   * written.
   */
  async storeIfAbsent(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string | null> {
    assertUploadWithinLimit(key, data.byteLength);
    await this.requireConditionalWrites();
    const objectKey = joinStorageKey(this.prefix ?? undefined, key);
    try {
      const put: S3PutObjectInput = {
        bucket: this.bucket,
        key: objectKey,
        body: data,
        cacheControl: objectCacheControl(),
        ifNoneMatch: "*"
      };
      if (contentType) {
        put.contentType = contentType;
      }
      await this.getClient().putObject(put);
    } catch (err) {
      if (
        err instanceof S3Error &&
        (err.statusCode === 412 || err.statusCode === 409)
      ) {
        return null;
      }
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
      entries: entries.sort((a, b) => compareStorageKeys(a.key, b.key)),
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
      if (response.cacheControl) {
        stat.cacheControl = response.cacheControl;
      }
      return stat;
    } catch {
      return null;
    }
  }

  /** Objects live in the bucket, not on this host. */
  async localPath(_uri: string): Promise<string | null> {
    return null;
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
