/**
 * Storage backend for Amazon S3 and S3-compatible services, backed by the
 * in-house SigV4 client in ./s3/.
 */

import { S3Client } from "./s3/client.js";
import type { AbstractStorage } from "./abstract-storage.js";
import { assertUploadWithinLimit } from "./storage-limits.js";

export class S3Storage implements AbstractStorage {
  private client: S3Client | null = null;

  constructor(
    private readonly bucketName: string,
    private readonly endpointUrl?: string,
    private readonly region: string = "us-east-1"
  ) {}

  private getClient(): S3Client {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: this.region,
      ...(this.endpointUrl
        ? { endpoint: this.endpointUrl, forcePathStyle: true }
        : {})
    });
    return this.client;
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    assertUploadWithinLimit(key, data.byteLength);
    await this.getClient().putObject({
      bucket: this.bucketName,
      key,
      body: data,
      ...(contentType ? { contentType } : {})
    });
  }

  async download(key: string): Promise<Buffer> {
    const { body } = await this.getClient().getObject({
      bucket: this.bucketName,
      key
    });
    return Buffer.from(body);
  }

  async delete(key: string): Promise<void> {
    await this.getClient().deleteObject({ bucket: this.bucketName, key });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getClient().headObject({ bucket: this.bucketName, key });
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    // Dotted bucket names break the wildcard TLS certificate on the
    // virtual-hosted form, so they get path-style URLs.
    if (this.bucketName.includes(".")) {
      return `https://s3.${this.region}.amazonaws.com/${this.bucketName}/${key}`;
    }
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
