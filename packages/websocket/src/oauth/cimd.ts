/**
 * Client ID Metadata Documents — the primary registration path (see design
 * doc § "Client registration"). A URL-shaped `client_id` is a document the
 * AS fetches and validates at authorize time; no registration table.
 *
 * Never throws: every fetch/parse/validation failure resolves to
 * `{ ok: false, error }`.
 */

import { safeFetch } from "@nodetool-ai/runtime";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const TIMEOUT_MS = 5000;
const DEFAULT_MAX_AGE_S = 300;
const MAX_MAX_AGE_S = 3600;

export type ClientMetadataResult =
  | { ok: true; clientName: string; redirectUris: string[] }
  | { ok: false; error: string };

/** The fetch shape `fetchClientMetadata` needs — `safeFetch`'s own shape. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry {
  result: { ok: true; clientName: string; redirectUris: string[] };
  expiresAt: number;
}

/** Bounded, insertion-ordered: expired entries are dropped on lookup and the
 * oldest entry is evicted at the cap, so an attacker rotating distinct
 * client_id URLs cannot grow it without bound. */
const MAX_CACHE_ENTRIES = 256;
const cache = new Map<string, CacheEntry>();

function cacheGet(url: string): CacheEntry | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(url);
    return null;
  }
  return entry;
}

function cacheSet(url: string, entry: CacheEntry): void {
  cache.delete(url);
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, entry);
}

/**
 * Read a body with the size cap enforced *while streaming* and the abort
 * timer still armed: `arrayBuffer()` after clearing the timeout would let a
 * server that answers headers fast then drips (or floods) the body hang the
 * authorize request or exhaust memory.
 */
async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    // Test doubles construct Response from a string — no stream, but the
    // body is already fully in memory, so the cap check is exact.
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A `client_id` is a CIMD reference when it's an https URL with a path. */
export function isClientIdUrl(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.pathname.length > 1;
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) {
    return DEFAULT_MAX_AGE_S;
  }
  const match = /max-age=(\d+)/.exec(cacheControl);
  if (!match) {
    return DEFAULT_MAX_AGE_S;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_AGE_S;
  }
  return Math.min(parsed, MAX_MAX_AGE_S);
}

/**
 * Fetch and validate a client's CIMD. `fetchImpl` defaults to `safeFetch`
 * (the SSRF-guarded fetch mandatory for any URL somebody else chose); tests
 * inject a double.
 */
export async function fetchClientMetadata(
  clientIdUrl: string,
  fetchImpl: FetchLike = safeFetch
): Promise<ClientMetadataResult> {
  try {
    const cached = cacheGet(clientIdUrl);
    if (cached) {
      return cached.result;
    }

    // The timer covers headers AND body: it is cleared only after the body
    // is fully read (or refused), so a drip-feed server cannot hold the
    // authorize request open past TIMEOUT_MS.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let body: Uint8Array | null;
    let cacheControl: string | null = null;
    try {
      let response: Response;
      try {
        response = await fetchImpl(clientIdUrl, { signal: controller.signal });
      } catch (err) {
        return {
          ok: false,
          error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`
        };
      }
      if (!response.ok) {
        return { ok: false, error: `unexpected status ${response.status}` };
      }
      cacheControl = response.headers.get("cache-control");
      try {
        body = await readBodyCapped(response, MAX_BODY_BYTES);
      } catch {
        return { ok: false, error: "failed to read response body" };
      }
    } finally {
      clearTimeout(timeout);
    }
    if (body === null) {
      return { ok: false, error: "client metadata document too large" };
    }

    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(Buffer.from(body).toString("utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      return { ok: false, error: "invalid JSON" };
    }

    const clientId = doc.client_id;
    if (typeof clientId !== "string" || clientId !== clientIdUrl) {
      return { ok: false, error: "client_id mismatch" };
    }

    const clientName = doc.client_name;
    if (typeof clientName !== "string" || clientName.length === 0) {
      return { ok: false, error: "missing client_name" };
    }

    const redirectUris = doc.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      !redirectUris.every((uri): uri is string => typeof uri === "string")
    ) {
      return { ok: false, error: "missing redirect_uris" };
    }

    const result = { ok: true as const, clientName, redirectUris };
    const maxAgeS = parseMaxAgeSeconds(cacheControl);
    cacheSet(clientIdUrl, { result, expiresAt: Date.now() + maxAgeS * 1000 });
    return result;
  } catch (err) {
    return {
      ok: false,
      error: `unexpected error: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
