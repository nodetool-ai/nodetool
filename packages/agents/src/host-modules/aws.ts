/**
 * `@nodetool-ai/sandbox-aws` — AWS Signature Version 4, on the host.
 *
 * The guest can already speak to S3: it is an HTTP API and `fetch` reaches it.
 * What the guest cannot do is sign the request. SigV4 is an HMAC-SHA256 chain
 * over a canonical form of the request, and getting the canonical form wrong
 * fails with a signature mismatch that says nothing about which rule was
 * broken. So the chain runs here, once, and the guest gets back headers it
 * hands straight to `fetch`.
 *
 * Nothing here performs I/O. The signer takes a request description and
 * returns a signed one; the network call stays in the guest, behind the fetch
 * bridge and its SSRF guard, where a run's caps apply to it.
 */

import { optionsOf } from "./limits.js";

/** Largest body the signer will hash, in bytes. */
const MAX_SIGNED_BODY_BYTES = 10 * 1024 * 1024;

/** The one algorithm SigV4 defines. */
const ALGORITHM = "AWS4-HMAC-SHA256";

/** Payload hash for a request whose body is not signed (presigned URLs). */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/** sha256 of the empty string, the payload hash of a body-less request. */
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** A signed request, shaped for `fetch(signed.url, signed)`. */
interface SignedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

function subtleCrypto(where: string): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(`${where}: WebCrypto is not available in this runtime`);
  }
  return subtle;
}

const encoder = new TextEncoder();

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(
  where: string,
  data: string | Uint8Array
): Promise<string> {
  const digest = await subtleCrypto(where).digest(
    "SHA-256",
    toBytes(data) as unknown as BufferSource
  );
  return toHex(new Uint8Array(digest));
}

async function hmac(
  where: string,
  key: Uint8Array,
  data: string
): Promise<Uint8Array> {
  const subtle = subtleCrypto(where);
  const cryptoKey = await subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data) as unknown as BufferSource
  );
  return new Uint8Array(signature);
}

/**
 * RFC 3986 percent-encoding.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS does not, which is the
 * difference between a signature that verifies and one that does not.
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * The canonical path.
 *
 * S3 signs the path exactly as it appears on the wire — an object key is
 * already a key, and normalizing it would sign a different object. Every other
 * service signs the *encoded* form of the already-encoded path, which is the
 * double-encoding the specification calls for.
 */
function canonicalUri(pathname: string, service: string): string {
  const path = pathname === "" ? "/" : pathname;
  if (service === "s3") return path;
  return path
    .split("/")
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // A segment that is not valid percent-encoding is signed as written.
      }
      return encodeRfc3986(decoded);
    })
    .join("/");
}

/** Query parameters, encoded and sorted by key then value. */
function canonicalQuery(params: URLSearchParams): string {
  const pairs: [string, string][] = [];
  for (const [key, value] of params) {
    pairs.push([encodeRfc3986(key), encodeRfc3986(value)]);
  }
  pairs.sort((a, b) =>
    a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1
  );
  return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

/** `20240115T093000Z` and its `20240115` date part. */
function amzDate(now: Date): { stamp: string; date: string } {
  const stamp = `${now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .slice(0, 15)}Z`;
  return { stamp, date: stamp.slice(0, 8) };
}

interface Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

function readCredentials(
  where: string,
  opts: Record<string, unknown>
): Credentials {
  const accessKeyId = String(opts.accessKeyId ?? "");
  const secretAccessKey = String(opts.secretAccessKey ?? "");
  if (accessKeyId === "" || secretAccessKey === "") {
    throw new Error(
      `${where}: accessKeyId and secretAccessKey are required — read them with nodetool.secrets.get("AWS_ACCESS_KEY_ID")`
    );
  }
  const sessionToken = opts.sessionToken;
  if (typeof sessionToken === "string" && sessionToken !== "") {
    return { accessKeyId, secretAccessKey, sessionToken };
  }
  return { accessKeyId, secretAccessKey };
}

function readUrl(where: string, opts: Record<string, unknown>): URL {
  const raw = String(opts.url ?? "");
  if (raw === "") throw new Error(`${where}: url is required`);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${where}: url is not a valid absolute URL`);
  }
}

function readHeaders(where: string, value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const source = optionsOf(value);
  for (const [name, headerValue] of Object.entries(source)) {
    if (headerValue === undefined || headerValue === null) continue;
    if (typeof headerValue === "object") {
      throw new Error(`${where}: header "${name}" must be a string`);
    }
    out[name] = String(headerValue);
  }
  return out;
}

function readBody(
  where: string,
  value: unknown
): string | Uint8Array | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    if (encoder.encode(value).length > MAX_SIGNED_BODY_BYTES) {
      throw new Error(
        `${where}: body exceeds the ${MAX_SIGNED_BODY_BYTES} byte signing limit`
      );
    }
    return value;
  }
  if (value instanceof Uint8Array) {
    if (value.length > MAX_SIGNED_BODY_BYTES) {
      throw new Error(
        `${where}: body exceeds the ${MAX_SIGNED_BODY_BYTES} byte signing limit`
      );
    }
    return value;
  }
  throw new Error(`${where}: body must be a string or Uint8Array`);
}

/** The `date/region/service/aws4_request` scope a signature is bound to. */
function credentialScope(
  date: string,
  region: string,
  service: string
): string {
  return `${date}/${region}/${service}/aws4_request`;
}

async function signingKey(
  where: string,
  secret: string,
  date: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  const kDate = await hmac(where, encoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(where, kDate, region);
  const kService = await hmac(where, kRegion, service);
  return hmac(where, kService, "aws4_request");
}

/**
 * Sign a request with SigV4, returning it ready for `fetch`.
 *
 * ```js
 * const signed = await sigv4({
 *   method: "GET",
 *   url: "https://my-bucket.s3.us-east-1.amazonaws.com/?list-type=2",
 *   region: "us-east-1",
 *   service: "s3",
 *   accessKeyId, secretAccessKey
 * });
 * const res = await fetch(signed.url, { method: signed.method, headers: signed.headers });
 * ```
 *
 * A body is hashed but never returned — the guest passes the same value to
 * `fetch` itself, so bytes never make the round trip twice.
 */
export async function sigv4(request?: unknown): Promise<SignedRequest> {
  const where = "aws.sigv4";
  const opts = optionsOf(request);
  const url = readUrl(where, opts);
  const method = String(opts.method ?? "GET").toUpperCase();
  const service = String(opts.service ?? "s3");
  const region = String(opts.region ?? "us-east-1");
  const credentials = readCredentials(where, opts);
  const body = readBody(where, opts.body);
  const { stamp, date } = amzDate(new Date());

  const payloadHash =
    typeof opts.payloadHash === "string" && opts.payloadHash !== ""
      ? opts.payloadHash
      : body === undefined
        ? EMPTY_SHA256
        : await sha256Hex(where, body);

  const headers: Record<string, string> = {
    ...readHeaders(where, opts.headers),
    host: url.host,
    "x-amz-date": stamp
  };
  if (service === "s3") headers["x-amz-content-sha256"] = payloadHash;
  if (credentials.sessionToken !== undefined) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const normalized = Object.entries(headers)
    .map(([name, value]) => [
      name.toLowerCase(),
      value.trim().replace(/\s+/g, " ")
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const signedHeaders = normalized.map(([name]) => name).join(";");
  const canonicalHeaders = normalized
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");

  const canonicalRequest = [
    method,
    canonicalUri(url.pathname, service),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const scope = credentialScope(date, region, service);
  const stringToSign = [
    ALGORITHM,
    stamp,
    scope,
    await sha256Hex(where, canonicalRequest)
  ].join("\n");

  const key = await signingKey(
    where,
    credentials.secretAccessKey,
    date,
    region,
    service
  );
  const signature = toHex(await hmac(where, key, stringToSign));

  return {
    url: url.toString(),
    method,
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  };
}

/**
 * A presigned URL — the signature in the query string, so the URL alone
 * authorizes the request for `expiresIn` seconds.
 *
 * ```js
 * const url = await presign({
 *   method: "GET",
 *   url: "https://my-bucket.s3.us-east-1.amazonaws.com/report.pdf",
 *   region: "us-east-1", service: "s3", expiresIn: 3600,
 *   accessKeyId, secretAccessKey
 * });
 * ```
 *
 * The payload is unsigned, which is what makes a presigned PUT usable: the
 * holder supplies the body.
 */
export async function presign(request?: unknown): Promise<string> {
  const where = "aws.presign";
  const opts = optionsOf(request);
  const url = readUrl(where, opts);
  const method = String(opts.method ?? "GET").toUpperCase();
  const service = String(opts.service ?? "s3");
  const region = String(opts.region ?? "us-east-1");
  const credentials = readCredentials(where, opts);
  const rawExpires = Number(opts.expiresIn ?? 3600);
  const expiresIn = Number.isFinite(rawExpires)
    ? Math.min(Math.max(Math.floor(rawExpires), 1), 604800)
    : 3600;
  const { stamp, date } = amzDate(new Date());
  const scope = credentialScope(date, region, service);

  const query = new URLSearchParams(url.searchParams);
  query.set("X-Amz-Algorithm", ALGORITHM);
  query.set("X-Amz-Credential", `${credentials.accessKeyId}/${scope}`);
  query.set("X-Amz-Date", stamp);
  query.set("X-Amz-Expires", String(expiresIn));
  query.set("X-Amz-SignedHeaders", "host");
  if (credentials.sessionToken !== undefined) {
    query.set("X-Amz-Security-Token", credentials.sessionToken);
  }

  // The signed query string is what has to reach the wire, character for
  // character: `URLSearchParams.toString()` writes a space as `+` and the
  // canonical form writes `%20`, so the canonical form is the one we keep.
  const signedQuery = canonicalQuery(query);
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname, service),
    signedQuery,
    `host:${url.host}\n`,
    "host",
    UNSIGNED_PAYLOAD
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    stamp,
    scope,
    await sha256Hex(where, canonicalRequest)
  ].join("\n");

  const key = await signingKey(
    where,
    credentials.secretAccessKey,
    date,
    region,
    service
  );
  const signature = toHex(await hmac(where, key, stringToSign));

  url.search = `${signedQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}
