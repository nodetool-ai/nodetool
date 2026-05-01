/**
 * SupabaseStorage — T-ST-5.
 *
 * Storage backend for Supabase Storage buckets.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AbstractStorage } from "./abstract-storage.js";

type SupabaseClientLike = SupabaseClient;

export class SupabaseStorage implements AbstractStorage {
  private client: SupabaseClientLike | null = null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly bucketName: string
  ) {}

  private getClientSync(): SupabaseClientLike {
    if (!this.client) {
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
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
    // Blob → ArrayBuffer → Buffer
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
    // Construct the public URL without needing the client.
    // Supabase public URL pattern: {supabaseUrl}/storage/v1/object/public/{bucket}/{key}
    // But we use the SDK pattern when client is available.
    if (this.client) {
      return this.client.storage.from(this.bucketName).getPublicUrl(key).data
        .publicUrl;
    }
    // Fallback: construct manually
    const base = this.supabaseUrl.replace(/\/+$/, "");
    return `${base}/storage/v1/object/public/${this.bucketName}/${key}`;
  }
}
