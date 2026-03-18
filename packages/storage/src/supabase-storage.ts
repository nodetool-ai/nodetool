/**
 * SupabaseStorage — storage backend for Supabase Storage buckets.
 *
 * Uses dynamic `import()` for `@supabase/supabase-js` so the SDK is an
 * optional runtime dependency — it is loaded lazily on first use, not at
 * compile time.
 *
 * The interfaces below (`SupabaseBucket`, `SupabaseStorageClient`, etc.) are
 * intentional **compile-time type stubs** that mirror the subset of the
 * Supabase SDK API used by this module. They allow the package to type-check
 * without requiring `@supabase/supabase-js` as a build-time dependency.
 * At runtime the real SDK module is loaded via `getClient()` and all five
 * {@link AbstractStorage} methods are fully implemented.
 */

import type { AbstractStorage } from "./abstract-storage.js";

/**
 * Compile-time type stubs for the Supabase SDK.
 *
 * These interfaces mirror the subset of `@supabase/supabase-js` that this
 * module uses. They exist so the package can be type-checked without the SDK
 * installed. At runtime the actual SDK classes are loaded via dynamic `import()`.
 */
interface SupabaseBucket {
  upload(
    path: string,
    data: Buffer | Uint8Array | Blob | ArrayBuffer,
    options?: { contentType?: string }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

interface SupabaseStorageClient {
  from(bucketName: string): SupabaseBucket;
}

interface SupabaseClientLike {
  storage: SupabaseStorageClient;
}

interface SupabaseSdkModule {
  createClient(url: string, key: string): SupabaseClientLike;
}

export class SupabaseStorage implements AbstractStorage {
  private client: SupabaseClientLike | null = null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly bucketName: string
  ) {}

  private async getClient(): Promise<SupabaseClientLike> {
    if (this.client) return this.client;
    const moduleName = "@supabase/supabase-js";
    const sdk = (await import(/* webpackIgnore: true */ moduleName)) as SupabaseSdkModule;
    this.client = sdk.createClient(this.supabaseUrl, this.supabaseKey);
    return this.client;
  }

  private async bucket(): Promise<SupabaseBucket> {
    const client = await this.getClient();
    return client.storage.from(this.bucketName);
  }

  async upload(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<void> {
    const b = await this.bucket();
    const options: { contentType?: string } = {};
    if (contentType) {
      options.contentType = contentType;
    }
    const { error } = await b.upload(key, data, options);
    if (error) {
      throw new Error(`Supabase upload failed for key "${key}": ${error.message}`);
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
      throw new Error(`Supabase delete failed for key "${key}": ${error.message}`);
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
      return this.client.storage.from(this.bucketName).getPublicUrl(key).data.publicUrl;
    }
    // Fallback: construct manually
    const base = this.supabaseUrl.replace(/\/+$/, "");
    return `${base}/storage/v1/object/public/${this.bucketName}/${key}`;
  }
}
