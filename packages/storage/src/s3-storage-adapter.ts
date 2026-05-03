import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./storage-adapter.js";
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
}
