/**
 * AWS Signature Version 4 signing for S3, over node:crypto primitives.
 *
 * Implements exactly the header-signing and query-presigning flows the S3
 * client needs. Reference: "Signature Calculations for the Authorization
 * Header" and "Authenticating Requests: Using Query Parameters" in the S3
 * API docs.
 */

import { createHash, createHmac } from "node:crypto";

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/** SHA-256 of the empty payload — the hash for bodyless requests. */
export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/**
 * Strict RFC 3986 percent-encoding: unreserved characters (A-Z a-z 0-9 - _ . ~)
 * pass through, everything else is encoded — including the characters
 * encodeURIComponent leaves bare (! ' ( ) *).
 */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Canonical URI for an S3 object path: each segment percent-encoded once,
 * `/` separators preserved (S3 does NOT double-encode the path).
 */
export function encodeS3Path(path: string): string {
  return path.split("/").map(encodeRfc3986).join("/");
}

/** ISO8601 basic timestamps: `20130524T000000Z` and its date part. */
export function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString(); // 2013-05-24T00:00:00.000Z
  const amzDate = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** Sorted, strictly-encoded canonical query string. */
export function canonicalQueryString(
  query: Record<string, string> | Array<[string, string]>
): string {
  const pairs = Array.isArray(query) ? query : Object.entries(query);
  return pairs
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
    )
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** The chained HMAC signing key: date → region → service → aws4_request. */
export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface SignRequestInput {
  method: string;
  /** Canonical (already percent-encoded) path starting with `/`. */
  path: string;
  query?: Record<string, string>;
  host: string;
  /** Extra headers to sign (e.g. content-type, x-amz-copy-source). */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the payload, or UNSIGNED-PAYLOAD. */
  payloadHash: string;
  region: string;
  service?: string;
  credentials: SigV4Credentials;
  /** Signing time; defaults to now. Fixed in tests. */
  date?: Date;
}

export interface SignedRequest {
  /** All headers to send, including host, x-amz-* and Authorization. */
  headers: Record<string, string>;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

/** Sign a request with the Authorization-header flow. */
export function signRequest(input: SignRequestInput): SignedRequest {
  const service = input.service ?? "s3";
  const { amzDate, dateStamp } = toAmzDate(input.date ?? new Date());
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;

  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate
  };
  if (input.credentials.sessionToken) {
    headers["x-amz-security-token"] = input.credentials.sessionToken;
  }

  const sortedNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lowered = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${canonicalHeaderValue(lowered.get(name) ?? "")}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    input.method,
    input.path,
    canonicalQueryString(input.query ?? {}),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(input.credentials.secretAccessKey, dateStamp, input.region, service)
  )
    .update(stringToSign)
    .digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { headers, canonicalRequest, stringToSign, signature };
}

export interface PresignUrlInput {
  method?: string;
  protocol: "http:" | "https:";
  host: string;
  /** Canonical (already percent-encoded) path starting with `/`. */
  path: string;
  query?: Record<string, string>;
  region: string;
  service?: string;
  credentials: SigV4Credentials;
  /** Validity in seconds (max 604800 per AWS). */
  expiresIn: number;
  /** Signing time; defaults to now. Fixed in tests. */
  date?: Date;
}

/** Presign a URL with the query-parameter flow (UNSIGNED-PAYLOAD). */
export function presignUrl(input: PresignUrlInput): string {
  const method = input.method ?? "GET";
  const service = input.service ?? "s3";
  const { amzDate, dateStamp } = toAmzDate(input.date ?? new Date());
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;

  const query: Record<string, string> = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": "host"
  };
  if (input.credentials.sessionToken) {
    query["X-Amz-Security-Token"] = input.credentials.sessionToken;
  }

  const canonicalQuery = canonicalQueryString(query);
  const canonicalRequest = [
    method,
    input.path,
    canonicalQuery,
    `host:${input.host}\n`,
    "host",
    UNSIGNED_PAYLOAD
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(input.credentials.secretAccessKey, dateStamp, input.region, service)
  )
    .update(stringToSign)
    .digest("hex");

  return `${input.protocol}//${input.host}${input.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
