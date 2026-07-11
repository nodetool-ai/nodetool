/**
 * Storage backend for Supabase Storage buckets, on top of the in-house
 * fetch-backed REST client (see supabase-rest.ts).
 */

import type { AbstractStorage } from "./abstract-storage.js";
import {
  createSupabaseStorageClient,
  type SupabaseStorageApi
} from "./supabase-rest.js";
import { assertUploadWithinLimit } from "./storage-limits.js";

export class SupabaseStorage implements AbstractStorage {
  private client: SupabaseStorageApi | null = null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly bucketName: string
  ) {}

  private getClientSync(): SupabaseStorageApi {
    if (!this.client) {
      this.client = createSupabaseStorageClient(
        this.supabaseUrl,
        this.supabaseKey
      );
    }
    return this.client;
  }

  private async bucket() {
    return this.getClientSync().storage.from(this.bucketName);
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    assertUploadWithinLimit(key, data.byteLength);
    const b = await this.bucket();
    const options: { contentType?: string } = {};
    if (contentType) {
      options.contentType = contentType;
    }
    const { error } = await b.upload(key, data, options);
    if (error) {
      throw new Error(
        `Supabase upload failed for key "${key}": ${error.message}`
      );
    }
  }

  async download(key: string): Promise<Buffer> {
    const b = await this.bucket();
    const { data, error } = await b.download(key);
    if (error || !data) {
      throw new Error(
        `Supabase download failed for key "${key}": ${error?.message ?? "no data returned"}`
      );
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(key: string): Promise<void> {
    const b = await this.bucket();
    const { error } = await b.remove([key]);
    if (error) {
      throw new Error(
        `Supabase delete failed for key "${key}": ${error.message}`
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    const b = await this.bucket();
    const { data, error } = await b.download(key);
    if (error) {
      return false;
    }
    return data !== null;
  }

  getUrl(key: string): string {
    // Public URL pattern: {supabaseUrl}/storage/v1/object/public/{bucket}/{key}
    if (this.client) {
      return this.client.storage.from(this.bucketName).getPublicUrl(key).data
        .publicUrl;
    }
    // Fallback: construct manually before the client is initialised.
    const base = this.supabaseUrl.replace(/\/+$/, "");
    return `${base}/storage/v1/object/public/${this.bucketName}/${key}`;
  }
}
