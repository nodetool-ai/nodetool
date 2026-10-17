/**
 * Openverse API client (https://api.openverse.org/v1/).
 *
 * Openverse indexes Creative Commons and public-domain images and audio.
 * Search is anonymous by default. When the user stores OPENVERSE_CLIENT_ID and
 * OPENVERSE_CLIENT_SECRET, the client exchanges them for a bearer token, which
 * raises the rate limit. The credentials stay on the server: the browser only
 * talks to the `openverse` tRPC router.
 *
 * The API host is fixed. The file URLs Openverse returns point at third-party
 * hosts (Flickr, Wikimedia, Freesound, …) and are downloaded through
 * `safeFetch`, so a result cannot steer the server at a private address.
 */

import { z } from "zod";
import { getSecret } from "@nodetool-ai/models";
import { safeFetch } from "@nodetool-ai/runtime";
import type {
  OpenverseLicenseRecord,
  OpenverseMediaType,
  OpenverseResult
} from "@nodetool-ai/protocol/api-schemas/openverse.js";

export const OPENVERSE_API_BASE = "https://api.openverse.org/v1";

const USER_AGENT = "NodeTool (+https://nodetool.ai)";
/** Openverse's anonymous page-size ceiling. Authenticated callers may ask for 50. */
export const OPENVERSE_PAGE_SIZE = 20;
const REQUEST_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive()
});

const mediaResult = z.object({
  id: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  thumbnail: z.string().nullish(),
  foreign_landing_url: z.string().nullish(),
  creator: z.string().nullish(),
  creator_url: z.string().nullish(),
  license: z.string(),
  license_version: z.string().nullish(),
  license_url: z.string().nullish(),
  attribution: z.string().nullish(),
  source: z.string().nullish(),
  filetype: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  duration: z.number().nullish()
});
type MediaResult = z.infer<typeof mediaResult>;

const searchResponse = z.object({
  result_count: z.number(),
  page_count: z.number(),
  page: z.number(),
  results: z.array(mediaResult)
});

export class OpenverseError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "OpenverseError";
  }
}

interface Credentials {
  clientId: string;
  clientSecret: string;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Drop cached access tokens. Tests call this between cases. */
export function clearOpenverseTokenCache(): void {
  tokenCache.clear();
}

async function readCredentials(userId: string): Promise<Credentials | null> {
  const clientId = ((await getSecret("OPENVERSE_CLIENT_ID", userId)) ?? "").trim();
  const clientSecret = (
    (await getSecret("OPENVERSE_CLIENT_SECRET", userId)) ?? ""
  ).trim();
  if (!clientId && !clientSecret) {
    return null;
  }
  if (!clientId || !clientSecret) {
    throw new OpenverseError(
      "Openverse credentials are incomplete. Set both OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET in Settings, or remove both to search anonymously."
    );
  }
  return { clientId, clientSecret };
}

async function errorDetail(response: Response): Promise<string> {
  return (await response.text()).slice(0, 300);
}

async function accessToken(credentials: Credentials): Promise<string> {
  const cached = tokenCache.get(credentials.clientId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const response = await fetch(`${OPENVERSE_API_BASE}/auth_tokens/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret
    }).toString(),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new OpenverseError(
      `Openverse rejected OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET (HTTP ${response.status}): ${await errorDetail(response)}`,
      response.status
    );
  }
  const token = tokenResponse.parse(await response.json());
  // Refresh a minute early so a token never expires mid-request.
  tokenCache.set(credentials.clientId, {
    token: token.access_token,
    expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000
  });
  return token.access_token;
}

async function apiGet(
  userId: string,
  path: string
): Promise<{ body: unknown; authenticated: boolean }> {
  const credentials = await readCredentials(userId);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT
  };
  if (credentials) {
    headers.Authorization = `Bearer ${await accessToken(credentials)}`;
  }
  const response = await fetch(`${OPENVERSE_API_BASE}/${path}`, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (response.status === 429) {
    throw new OpenverseError(
      credentials
        ? "Openverse rate limit reached. Try again in a minute."
        : "Openverse rate limit reached. Anonymous searches share a low limit. Add OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET in Settings for a higher one.",
      429
    );
  }
  if (response.status === 404) {
    throw new OpenverseError("Openverse has no such item.", 404);
  }
  if (!response.ok) {
    throw new OpenverseError(
      `Openverse request failed (HTTP ${response.status}): ${await errorDetail(response)}`,
      response.status
    );
  }
  return { body: await response.json(), authenticated: credentials !== null };
}

function licenseRecord(
  mediaType: OpenverseMediaType,
  result: MediaResult
): OpenverseLicenseRecord {
  return {
    id: result.id,
    media_type: mediaType,
    title: result.title ?? "",
    creator: result.creator ?? "",
    creator_url: result.creator_url ?? "",
    license: result.license,
    license_version: result.license_version ?? "",
    license_url: result.license_url ?? "",
    attribution: result.attribution ?? "",
    landing_url: result.foreign_landing_url ?? "",
    source: result.source ?? ""
  };
}

function toResult(
  mediaType: OpenverseMediaType,
  result: MediaResult
): OpenverseResult {
  return {
    ...licenseRecord(mediaType, result),
    url: result.url ?? "",
    thumbnail: result.thumbnail ?? "",
    filetype: result.filetype ?? "",
    width: result.width ?? null,
    height: result.height ?? null,
    // Openverse reports audio duration in milliseconds.
    duration_seconds:
      typeof result.duration === "number" ? result.duration / 1000 : null
  };
}

export interface OpenverseSearchParams {
  mediaType: OpenverseMediaType;
  q: string;
  licenseType: "all" | "commercial" | "modification";
  category?: string;
  page: number;
}

export async function searchOpenverse(
  userId: string,
  params: OpenverseSearchParams
): Promise<{
  results: OpenverseResult[];
  result_count: number;
  page: number;
  page_count: number;
  authenticated: boolean;
}> {
  const query = new URLSearchParams({
    q: params.q,
    page: String(params.page),
    page_size: String(OPENVERSE_PAGE_SIZE)
  });
  if (params.licenseType !== "all") {
    query.set("license_type", params.licenseType);
  }
  if (params.category) {
    query.set("category", params.category);
  }
  const { body, authenticated } = await apiGet(
    userId,
    `${params.mediaType}/?${query.toString()}`
  );
  const parsed = searchResponse.parse(body);
  return {
    // A result with no file cannot be previewed or imported.
    results: parsed.results
      .filter((result) => Boolean(result.url))
      .map((result) => toResult(params.mediaType, result)),
    result_count: parsed.result_count,
    page: parsed.page,
    page_count: parsed.page_count,
    authenticated
  };
}

/** Look one result up by id. The import path never trusts a client-supplied URL. */
export async function getOpenverseItem(
  userId: string,
  mediaType: OpenverseMediaType,
  id: string
): Promise<OpenverseResult> {
  const { body } = await apiGet(
    userId,
    `${mediaType}/${encodeURIComponent(id)}/`
  );
  return toResult(mediaType, mediaResult.parse(body));
}

/** Download an item's file. Refuses private hosts, plain http and oversize bodies. */
export async function downloadOpenverseFile(
  item: OpenverseResult,
  maxBytes: number
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!item.url) {
    throw new OpenverseError("This item has no downloadable file.");
  }
  let response: Response;
  try {
    response = await safeFetch(item.url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    });
  } catch (error) {
    throw new OpenverseError(
      `Could not download the file from ${item.source || "its source"}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    throw new OpenverseError(
      `${item.source || "The source"} answered HTTP ${response.status} for this file. It may have been removed.`,
      response.status
    );
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new OpenverseError(
      `The file is larger than the upload limit (${maxBytes} bytes).`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new OpenverseError(
      `The file is larger than the upload limit (${maxBytes} bytes).`
    );
  }
  const header = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const fallback = item.media_type === "images" ? "image/jpeg" : "audio/mpeg";
  const expected = item.media_type === "images" ? "image/" : "audio/";
  return {
    bytes,
    contentType: header && header.startsWith(expected) ? header : fallback
  };
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/mp4": "m4a"
};

/** A file name from the item's title, with the extension the bytes deserve. */
export function openverseAssetName(
  item: OpenverseResult,
  contentType: string
): string {
  const extension =
    EXTENSIONS[contentType] ||
    item.filetype ||
    (item.media_type === "images" ? "jpg" : "mp3");
  const base =
    item.title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || `openverse-${item.id.slice(0, 8)}`;
  return `${base}.${extension}`;
}
