import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "./storage-adapter.js";

export interface SupabaseStorageAdapterOptions {
  url: string;
  apiKey: string;
  bucket: string;
  /** Optional pre-built client (used by tests). */
  client?: SupabaseClient;
}

/**
 * Supabase Storage adapter using `@supabase/supabase-js`.
 *
 * URI scheme: `supabase://<bucket>/<key>`. Use `getPublicUrl(uri)` to obtain a
 * client-facing HTTPS URL (the temp-url resolver in the websocket runner does
 * this for `temp_url` asset output mode).
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly bucket: string;
  readonly url: string;
  private readonly apiKey: string;
  private client: SupabaseClient | null;

  constructor(opts: SupabaseStorageAdapterOptions) {
    if (!opts.url) throw new Error("Supabase URL is required");
    if (!opts.apiKey) throw new Error("Supabase API key is required");
    if (!opts.bucket) throw new Error("Supabase bucket is required");
    this.url = opts.url;
    this.apiKey = opts.apiKey;
    this.bucket = opts.bucket;
    this.client = opts.client ?? null;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(this.url, this.apiKey);
    }
    return this.client;
  }

  private parseUri(uri: string): { bucket: string; key: string } | null {
    if (!uri.startsWith("supabase://")) return null;
    const withoutScheme = uri.slice("supabase://".length);
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
    const { error } = await this.getClient()
      .storage.from(this.bucket)
      .upload(key, data, {
        upsert: true,
        ...(contentType ? { contentType } : {})
      });
    if (error) {
      throw new Error(`Supabase upload failed for "${key}": ${error.message}`);
    }
    return `supabase://${this.bucket}/${key}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    const { data, error } = await this.getClient()
      .storage.from(parsed.bucket)
      .download(parsed.key);
    if (error || !data) return null;
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  }

  async exists(uri: string): Promise<boolean> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return false;
    const dir = parsed.key.includes("/")
      ? parsed.key.slice(0, parsed.key.lastIndexOf("/"))
      : "";
    const name = parsed.key.includes("/")
      ? parsed.key.slice(parsed.key.lastIndexOf("/") + 1)
      : parsed.key;
    const { data, error } = await this.getClient()
      .storage.from(parsed.bucket)
      .list(dir, { search: name, limit: 1 });
    if (error || !data) return false;
    return data.some((entry) => entry.name === name);
  }

  async delete(uri: string): Promise<void> {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return;
    await this.getClient().storage.from(parsed.bucket).remove([parsed.key]);
  }

  /**
   * Convert an internal `supabase://bucket/key` URI to a public HTTPS URL.
   * Returns `null` if the URI does not belong to this adapter.
   */
  getPublicUrl(uri: string): string | null {
    const parsed = this.parseUri(uri);
    if (!parsed || parsed.bucket !== this.bucket) return null;
    return this.getClient()
      .storage.from(parsed.bucket)
      .getPublicUrl(parsed.key).data.publicUrl;
  }
}
