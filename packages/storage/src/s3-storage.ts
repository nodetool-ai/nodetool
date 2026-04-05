/**
 * S3Storage — T-ST-4.
 *
 * Storage backend for Amazon S3 and S3-compatible services.
 * Uses dynamic import for @aws-sdk/client-s3 (optional dependency).
 */

import type { AbstractStorage } from "./abstract-storage.js";

/**
 * Inline type definitions that mirror the @aws-sdk/client-s3 public API surface
 * used by S3Storage.  Declaring them here keeps @aws-sdk/client-s3 an optional
 * *runtime* dependency — the package compiles and type-checks without it.  At
 * runtime the real SDK is loaded via dynamic `import()` inside `loadSdk()`.
 */
interface S3ClientLike {
  send(command: unknown): Promise<any>;
}

interface S3SdkModule {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
}

let cachedSdk: S3SdkModule | null = null;

async function loadSdk(): Promise<S3SdkModule> {
  if (cachedSdk) return cachedSdk;
  const moduleName = "@aws-sdk/client-s3";
  cachedSdk = (await import(
    /* webpackIgnore: true */ moduleName
  )) as S3SdkModule;
  return cachedSdk;
}

export class S3Storage implements AbstractStorage {
  private client: S3ClientLike | null = null;

  constructor(
    private readonly bucketName: string,
    private readonly endpointUrl?: string,
    private readonly domain?: string,
    private readonly region: string = "us-east-1"
  ) {}

  private async getClient(): Promise<S3ClientLike> {
    if (this.client) return this.client;
    const sdk = await loadSdk();
    const config: Record<string, unknown> = { region: this.region };
    if (this.endpointUrl) {
      config.endpoint = this.endpointUrl;
      config.forcePathStyle = true;
    }
    this.client = new sdk.S3Client(config);
    return this.client;
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    const sdk = await loadSdk();
    const client = await this.getClient();
    const params: Record<string, unknown> = {
      Bucket: this.bucketName,
      Key: key,
      Body: data
    };
    if (contentType) {
      params.ContentType = contentType;
    }
    await client.send(new sdk.PutObjectCommand(params));
  }

  async download(key: string): Promise<Buffer> {
    const sdk = await loadSdk();
    const client = await this.getClient();
    const response = await client.send(
      new sdk.GetObjectCommand({ Bucket: this.bucketName, Key: key })
    );
    const body = response.Body;
    if (!body) {
      throw new Error(`Empty response body for key: ${key}`);
    }
    // body is a Readable stream in Node.js
    if (typeof body.transformToByteArray === "function") {
      const bytes: Uint8Array = await body.transformToByteArray();
      return Buffer.from(bytes);
    }
    // Fallback: collect chunks from readable stream
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const sdk = await loadSdk();
    const client = await this.getClient();
    await client.send(
      new sdk.DeleteObjectCommand({ Bucket: this.bucketName, Key: key })
    );
  }

  async exists(key: string): Promise<boolean> {
    const sdk = await loadSdk();
    const client = await this.getClient();
    try {
      await client.send(
        new sdk.HeadObjectCommand({ Bucket: this.bucketName, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    if (this.domain) {
      if (this.domain.startsWith("http")) {
        return `${this.domain}/${key}`;
      }
      return `https://${this.domain}/${key}`;
    }
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
