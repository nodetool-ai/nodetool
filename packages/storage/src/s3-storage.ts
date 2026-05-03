/**
 * S3Storage — T-ST-4.
 *
 * Storage backend for Amazon S3 and S3-compatible services.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import type { AbstractStorage } from "./abstract-storage.js";

interface S3ClientLike {
  send(command: unknown): Promise<any>;
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
    const config: Record<string, unknown> = { region: this.region };
    if (this.endpointUrl) {
      config.endpoint = this.endpointUrl;
      config.forcePathStyle = true;
    }
    this.client = new S3Client(config);
    return this.client;
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: data,
        ...(contentType ? { ContentType: contentType } : {})
      })
    );
  }

  async download(key: string): Promise<Buffer> {
    const client = await this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key })
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
    const client = await this.getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucketName, Key: key })
    );
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key })
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
