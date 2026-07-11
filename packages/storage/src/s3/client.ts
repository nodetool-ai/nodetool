/**
 * In-house S3 client: SigV4-signed REST calls over fetch.
 *
 * Covers the operations NodeTool uses — Put/Get/Head/Delete/Copy object,
 * ListObjectsV2, ListBuckets, presigned GET — against AWS S3 and
 * S3-compatible endpoints (MinIO, R2) via endpoint override + path-style
 * addressing. Bodies are buffered (that matches every call site today);
 * multipart upload is deliberately out of scope. Credentials resolve through
 * ./credentials.js (explicit, env vars, shared profile, or an injected
 * provider); safe/idempotent operations retry transient failures with
 * exponential backoff.
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  cacheCredentials,
  createDefaultCredentialProvider,
  type CredentialProvider
} from "./credentials.js";
import {
  canonicalQueryString,
  EMPTY_PAYLOAD_SHA256,
  encodeS3Path,
  presignUrl,
  sha256Hex,
  signRequest,
  type SigV4Credentials
} from "./signer.js";
import { xmlBlocks, xmlText } from "./xml.js";

/**
 * Error for a non-2xx S3 response. `code` is the S3 error code from the XML
 * body (e.g. `NoSuchKey`, `AccessDenied`) or an HTTP fallback (`NotFound` for
 * a bodyless 404). `name` mirrors `code` so name-based checks keep working.
 */
export class S3Error extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = code;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface S3ObjectRef {
  bucket: string;
  key: string;
}

export interface S3PutObjectInput extends S3ObjectRef {
  body: Uint8Array;
  contentType?: string;
}

export interface S3PutObjectResult {
  etag?: string;
}

export interface S3GetObjectResult {
  body: Uint8Array;
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
  etag?: string;
}

export interface S3HeadObjectResult {
  contentLength: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
}

export interface S3CopyObjectInput {
  sourceBucket: string;
  sourceKey: string;
  bucket: string;
  key: string;
}

export interface S3ListObjectsV2Input {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface S3ObjectSummary {
  key: string;
  size: number;
  lastModified?: Date;
  etag?: string;
  storageClass?: string;
}

export interface S3ListObjectsV2Result {
  contents: S3ObjectSummary[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface S3BucketSummary {
  name: string;
  creationDate?: Date;
}

export interface S3PresignGetObjectInput extends S3ObjectRef {
  /** Validity in seconds. */
  expiresIn: number;
}

/**
 * The object-level surface `S3StorageAdapter` needs. `S3Client` implements
 * it; tests inject fakes.
 */
export interface S3Api {
  putObject(input: S3PutObjectInput): Promise<S3PutObjectResult>;
  getObject(input: S3ObjectRef): Promise<S3GetObjectResult>;
  headObject(input: S3ObjectRef): Promise<S3HeadObjectResult>;
  deleteObject(input: S3ObjectRef): Promise<void>;
  listObjectsV2(input: S3ListObjectsV2Input): Promise<S3ListObjectsV2Result>;
}

export interface S3RetryOptions {
  /** Total attempts per retryable operation (1 = no retries). Default 3. */
  maxAttempts?: number;
  /** Sleep override for tests. Defaults to setTimeout. */
  sleepFn?: (ms: number) => Promise<void>;
}

export interface S3ClientOptions {
  region?: string;
  /**
   * Endpoint override for S3-compatible services (MinIO, R2). Implies
   * path-style addressing unless `forcePathStyle: false`.
   */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Explicit static credentials; takes precedence over `credentialProvider`. */
  credentials?: SigV4Credentials;
  /**
   * Async credential source (cached, refreshed near expiry). Defaults to the
   * env-vars → shared-profile chain from ./credentials.js.
   */
  credentialProvider?: CredentialProvider;
  retry?: S3RetryOptions;
  /** Fetch implementation override for tests. */
  fetchFn?: typeof fetch;
}

interface Target {
  protocol: "http:" | "https:";
  host: string;
  /** Path including any endpoint base path and path-style bucket, encoded. */
  path: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 100;
const BACKOFF_CAP_MS = 2_000;
const RETRY_AFTER_CAP_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDateHeader(value: string | null): Date | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

/** Retry-After header: delta-seconds or an HTTP-date, clamped to a cap. */
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  let ms: number;
  if (/^\d+$/.test(value)) {
    ms = Number.parseInt(value, 10) * 1000;
  } else {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return null;
    ms = at - Date.now();
  }
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}

/**
 * Virtual-hosted addressing needs the bucket as a TLS-valid subdomain label:
 * dots in the bucket name break the `*.s3.<region>.amazonaws.com` wildcard
 * certificate, so dotted buckets go path-style.
 */
function isVirtualHostable(bucket: string): boolean {
  return !bucket.includes(".");
}

/** True when any path segment of the key is `.` or `..`. */
function hasDotSegments(key: string): boolean {
  return key.split("/").some((segment) => segment === "." || segment === "..");
}

/**
 * Send a request over node:http(s) with the path preserved verbatim. fetch
 * (WHATWG URL) normalizes dot segments like `/a/../b` — which S3 treats as a
 * literal key — so those requests bypass fetch entirely.
 */
function rawPathRequest(input: {
  protocol: "http:" | "https:";
  host: string;
  pathWithQuery: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}): Promise<Response> {
  const requestFn = input.protocol === "http:" ? httpRequest : httpsRequest;
  const colon = input.host.lastIndexOf(":");
  const hasPort = colon > 0 && /^\d+$/.test(input.host.slice(colon + 1));
  const hostname = hasPort ? input.host.slice(0, colon) : input.host;
  const port = hasPort ? Number(input.host.slice(colon + 1)) : undefined;
  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        hostname,
        ...(port !== undefined ? { port } : {}),
        path: input.pathWithQuery,
        method: input.method,
        headers: input.headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers.set(name, value);
            else if (Array.isArray(value)) headers.set(name, value.join(", "));
          }
          const bodyAllowed =
            input.method !== "HEAD" && status !== 204 && status !== 304;
          resolve(
            new Response(bodyAllowed && body.length > 0 ? body : null, {
              status,
              headers
            })
          );
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    if (input.body) req.write(input.body);
    req.end();
  });
}

export class S3Client implements S3Api {
  private readonly region: string;
  private readonly endpoint: URL | null;
  private readonly pathStyle: boolean;
  private readonly credentialProvider: CredentialProvider;
  private readonly customFetch: typeof fetch | null;
  private readonly maxAttempts: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: S3ClientOptions = {}) {
    this.region = options.region ?? "us-east-1";
    this.endpoint = options.endpoint ? new URL(options.endpoint) : null;
    this.pathStyle = options.forcePathStyle ?? this.endpoint !== null;
    const explicit = options.credentials;
    this.credentialProvider = explicit
      ? async () => explicit
      : cacheCredentials(
          options.credentialProvider ?? createDefaultCredentialProvider()
        );
    this.customFetch = options.fetchFn ?? null;
    this.maxAttempts = options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.sleepFn = options.retry?.sleepFn ?? defaultSleep;
  }

  /** Resolve protocol/host/path for a bucket (null = service root) and key. */
  private target(bucket: string | null, key?: string): Target {
    const keyPath = key ? `/${encodeS3Path(key)}` : "";
    if (this.endpoint) {
      const protocol = this.endpoint.protocol === "http:" ? "http:" : "https:";
      let basePath = this.endpoint.pathname;
      while (basePath.endsWith("/")) basePath = basePath.slice(0, -1);
      if (bucket && !this.pathStyle) {
        return {
          protocol,
          host: `${bucket}.${this.endpoint.host}`,
          path: `${basePath}${keyPath}` || "/"
        };
      }
      const bucketPath = bucket ? `/${bucket}` : "";
      return {
        protocol,
        host: this.endpoint.host,
        path: `${basePath}${bucketPath}${keyPath}` || "/"
      };
    }
    if (bucket && !this.pathStyle && isVirtualHostable(bucket)) {
      return {
        protocol: "https:",
        host: `${bucket}.s3.${this.region}.amazonaws.com`,
        path: keyPath || "/"
      };
    }
    const bucketPath = bucket ? `/${bucket}` : "";
    return {
      protocol: "https:",
      host: `s3.${this.region}.amazonaws.com`,
      path: `${bucketPath}${keyPath}` || "/"
    };
  }

  private async send(
    target: Target,
    canonicalQuery: string,
    init: { method: string; headers: Record<string, string>; body?: Uint8Array }
  ): Promise<Response> {
    const pathWithQuery = `${target.path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
    const url = `${target.protocol}//${target.host}${pathWithQuery}`;
    if (this.customFetch) {
      return this.customFetch(url, {
        method: init.method,
        headers: init.headers,
        ...(init.body ? { body: new Uint8Array(init.body) } : {})
      });
    }
    // fetch normalizes dot segments in the path; when that would change the
    // signed path (keys like `a/../b`), send over a raw-path transport.
    if (new URL(url).pathname !== target.path) {
      return rawPathRequest({
        protocol: target.protocol,
        host: target.host,
        pathWithQuery,
        method: init.method,
        headers: init.headers,
        ...(init.body ? { body: init.body } : {})
      });
    }
    return fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body ? { body: new Uint8Array(init.body) } : {})
    });
  }

  private async request(input: {
    method: string;
    bucket: string | null;
    key?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Uint8Array;
    /** Retry transient failures. Only safe/idempotent operations set this. */
    retryable?: boolean;
  }): Promise<Response> {
    const target = this.target(input.bucket, input.key);
    const payloadHash = input.body ? sha256Hex(input.body) : EMPTY_PAYLOAD_SHA256;
    // Send the query exactly as signed (strict RFC 3986 encoding, sorted).
    const canonicalQuery = canonicalQueryString(input.query ?? {});
    const maxAttempts = input.retryable ? this.maxAttempts : 1;

    for (let attempt = 1; ; attempt++) {
      // Re-sign per attempt so x-amz-date stays fresh across backoff waits.
      const signed = signRequest({
        method: input.method,
        path: target.path,
        query: input.query ?? {},
        host: target.host,
        headers: input.headers ?? {},
        payloadHash,
        region: this.region,
        credentials: await this.credentialProvider()
      });

      let response: Response;
      try {
        response = await this.send(target, canonicalQuery, {
          method: input.method,
          headers: signed.headers,
          ...(input.body ? { body: input.body } : {})
        });
      } catch (err) {
        // Network-level failure (connection refused, reset, DNS, timeout).
        if (attempt < maxAttempts) {
          await this.sleepFn(this.backoffMs(attempt, null));
          continue;
        }
        throw err;
      }

      if (response.ok) return response;
      const error = await this.toError(response);
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < maxAttempts) {
        await this.sleepFn(
          this.backoffMs(attempt, response.headers.get("retry-after"))
        );
        continue;
      }
      throw error;
    }
  }

  private backoffMs(attempt: number, retryAfterHeader: string | null): number {
    const retryAfter = parseRetryAfterMs(retryAfterHeader);
    if (retryAfter !== null) return retryAfter;
    return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  }

  private async toError(response: Response): Promise<S3Error> {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // No readable body (e.g. HEAD); fall back to the HTTP status.
    }
    const code =
      xmlText(body, "Code") ??
      (response.status === 404 ? "NotFound" : `HTTP${response.status}`);
    const message =
      xmlText(body, "Message") ?? `S3 request failed with status ${response.status}`;
    return new S3Error(code, message, response.status);
  }

  async putObject(input: S3PutObjectInput): Promise<S3PutObjectResult> {
    const response = await this.request({
      method: "PUT",
      bucket: input.bucket,
      key: input.key,
      headers: input.contentType ? { "content-type": input.contentType } : {},
      body: input.body,
      retryable: true
    });
    const etag = response.headers.get("etag");
    return etag ? { etag } : {};
  }

  async getObject(input: S3ObjectRef): Promise<S3GetObjectResult> {
    const response = await this.request({
      method: "GET",
      bucket: input.bucket,
      key: input.key,
      retryable: true
    });
    const body = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : undefined;
    const lastModified = parseDateHeader(response.headers.get("last-modified"));
    const etag = response.headers.get("etag");
    return {
      body,
      ...(contentType ? { contentType } : {}),
      ...(contentLength !== undefined && Number.isFinite(contentLength)
        ? { contentLength }
        : {}),
      ...(lastModified ? { lastModified } : {}),
      ...(etag ? { etag } : {})
    };
  }

  async headObject(input: S3ObjectRef): Promise<S3HeadObjectResult> {
    const response = await this.request({
      method: "HEAD",
      bucket: input.bucket,
      key: input.key,
      retryable: true
    });
    const contentLengthHeader = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");
    const lastModified = parseDateHeader(response.headers.get("last-modified"));
    const etag = response.headers.get("etag");
    return {
      contentLength: contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : 0,
      ...(contentType ? { contentType } : {}),
      ...(lastModified ? { lastModified } : {}),
      ...(etag ? { etag } : {})
    };
  }

  async deleteObject(input: S3ObjectRef): Promise<void> {
    await this.request({
      method: "DELETE",
      bucket: input.bucket,
      key: input.key,
      retryable: true
    });
  }

  async copyObject(input: S3CopyObjectInput): Promise<void> {
    const response = await this.request({
      method: "PUT",
      bucket: input.bucket,
      key: input.key,
      headers: {
        "x-amz-copy-source": `/${input.sourceBucket}/${encodeS3Path(input.sourceKey)}`
      }
    });
    // CopyObject reports failure-after-200 in the body; surface it.
    const body = await response.text();
    if (body.includes("<Error>")) {
      const code = xmlText(body, "Code") ?? "CopyObjectError";
      const message = xmlText(body, "Message") ?? "S3 CopyObject failed";
      throw new S3Error(code, message, response.status);
    }
  }

  async listObjectsV2(
    input: S3ListObjectsV2Input
  ): Promise<S3ListObjectsV2Result> {
    const query: Record<string, string> = { "list-type": "2" };
    if (input.prefix) query.prefix = input.prefix;
    if (input.delimiter) query.delimiter = input.delimiter;
    if (input.maxKeys !== undefined) query["max-keys"] = String(input.maxKeys);
    if (input.continuationToken) {
      query["continuation-token"] = input.continuationToken;
    }
    const response = await this.request({
      method: "GET",
      bucket: input.bucket,
      query,
      retryable: true
    });
    const xml = await response.text();

    const contents: S3ObjectSummary[] = xmlBlocks(xml, "Contents").map(
      (block) => {
        const lastModifiedText = xmlText(block, "LastModified");
        const lastModified = lastModifiedText
          ? parseDateHeader(lastModifiedText)
          : undefined;
        const etag = xmlText(block, "ETag");
        const storageClass = xmlText(block, "StorageClass");
        return {
          key: xmlText(block, "Key") ?? "",
          size: Number.parseInt(xmlText(block, "Size") ?? "0", 10) || 0,
          ...(lastModified ? { lastModified } : {}),
          ...(etag ? { etag } : {}),
          ...(storageClass ? { storageClass } : {})
        };
      }
    );

    const commonPrefixes = xmlBlocks(xml, "CommonPrefixes")
      .map((block) => xmlText(block, "Prefix"))
      .filter((p): p is string => p !== null);

    const nextContinuationToken = xmlText(xml, "NextContinuationToken");
    return {
      contents,
      commonPrefixes,
      isTruncated: xmlText(xml, "IsTruncated") === "true",
      ...(nextContinuationToken ? { nextContinuationToken } : {})
    };
  }

  async listBuckets(): Promise<S3BucketSummary[]> {
    const response = await this.request({
      method: "GET",
      bucket: null,
      retryable: true
    });
    const xml = await response.text();
    return xmlBlocks(xml, "Bucket").map((block) => {
      const creationDateText = xmlText(block, "CreationDate");
      const creationDate = creationDateText
        ? parseDateHeader(creationDateText)
        : undefined;
      return {
        name: xmlText(block, "Name") ?? "",
        ...(creationDate ? { creationDate } : {})
      };
    });
  }

  /** Presigned GET URL, valid for `expiresIn` seconds. */
  async presignGetObject(input: S3PresignGetObjectInput): Promise<string> {
    if (hasDotSegments(input.key)) {
      // Standard URL clients normalize `.`/`..` segments before sending, so
      // a presigned URL for such a key could never match its signature.
      throw new Error(
        `Cannot presign S3 key "${input.key}": keys with "." or ".." path segments are normalized away by URL clients, so the signed URL would not address this object.`
      );
    }
    const target = this.target(input.bucket, input.key);
    return presignUrl({
      protocol: target.protocol,
      host: target.host,
      path: target.path,
      region: this.region,
      credentials: await this.credentialProvider(),
      expiresIn: input.expiresIn
    });
  }
}
