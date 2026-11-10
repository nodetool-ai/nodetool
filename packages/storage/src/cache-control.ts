/**
 * The `Cache-Control` value every object upload carries.
 *
 * Supabase Storage stores `no-cache` on an object uploaded without one, and
 * a signed URL cannot be revalidated, so the browser downloaded the whole
 * object again each time an `<img>` or `<video>` mounted. The asset URL
 * builder hands out one URL per key and version, and a new version gets a
 * new URL, so a browser may keep the bytes for the URL's whole lifetime.
 *
 * Read on each call, not at module load, so importing the storage package
 * never touches the config.
 */
import { SIGNED_URL_TTL } from "@nodetool-ai/config";

export function objectCacheControl(): string {
  return `max-age=${SIGNED_URL_TTL}`;
}
