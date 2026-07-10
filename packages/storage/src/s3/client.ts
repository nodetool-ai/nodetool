/**
 * In-house S3 client: SigV4-signed REST calls over fetch.
 *
 * Covers the operations NodeTool uses — Put/Get/Head/Delete/Copy object,
 * ListObjectsV2, ListBuckets, presigned GET — against AWS S3 and
 * S3-compatible endpoints (MinIO, R2) via endpoint override + path-style
 * addressing. Bodies are buffered (that matches every call site today);
 * multipart upload and the full AWS credential-provider chain (profiles,
 * IMDS) are deliberately out of scope.
 */

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

export interface S3ClientOptions {
  region?: string;
  /**
   * Endpoint override for S3-compatible services (MinIO, R2). Implies
   * path-style addressing unless `forcePathStyle: false`.
   */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Explicit credentials; defaults to AWS_* environment variables. */
  credentials?: SigV4Credentials;
  /** Fetch implementation override for tests. */
  fetchFn?: typeof fetch;
}

interface Target {
  protocol: "http:" | "https:";
  host: string;
  /** Path including any endpoint base path and path-style bucket, encoded. */
  path: string;
}

function parseDateHeader(value: string | null): Date | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

export class S3Client implements S3Api {
  private readonly region: string;
  private readonly endpoint: URL | null;
  private readonly pathStyle: boolean;
  private readonly credentials: SigV4Credentials | null;
  private readonly fetchFn: typeof fetch;

  constructor(options: S3ClientOptions = {}) {
    this.region = options.region ?? "us-east-1";
    this.endpoint = options.endpoint ? new URL(options.endpoint) : null;
    this.pathStyle = options.forcePathStyle ?? this.endpoint !== null;
    this.credentials = options.credentials ?? null;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private resolveCredentials(): SigV4Credentials {
    if (this.credentials) return this.credentials;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "AWS credentials not found: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and optionally AWS_SESSION_TOKEN), or pass credentials to S3Client."
      );
    }
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    return {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {})
    };
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
    if (bucket && !this.pathStyle) {
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

  private async request(input: {
    method: string;
    bucket: string | null;
    key?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Uint8Array;
  }): Promise<Response> {
    const target = this.target(input.bucket, input.key);
    const payloadHash = input.body ? sha256Hex(input.body) : EMPTY_PAYLOAD_SHA256;
    const signed = signRequest({
      method: input.method,
      path: target.path,
      query: input.query ?? {},
      host: target.host,
      headers: input.headers ?? {},
      payloadHash,
      region: this.region,
      credentials: this.resolveCredentials()
    });

    // Send the query exactly as signed (strict RFC 3986 encoding, sorted).
    const canonicalQuery = canonicalQueryString(input.query ?? {});
    const url = `${target.protocol}//${target.host}${target.path}${
      canonicalQuery ? `?${canonicalQuery}` : ""
    }`;

    const response = await this.fetchFn(url, {
      method: input.method,
      headers: signed.headers,
      ...(input.body ? { body: new Uint8Array(input.body) } : {})
    });
    if (!response.ok) {
      throw await this.toError(response);
    }
    return response;
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
      body: input.body
    });
    const etag = response.headers.get("etag");
    return etag ? { etag } : {};
  }

  async getObject(input: S3ObjectRef): Promise<S3GetObjectResult> {
    const response = await this.request({
      method: "GET",
      bucket: input.bucket,
      key: input.key
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
      key: input.key
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
      key: input.key
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
      query
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
    const response = await this.request({ method: "GET", bucket: null });
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
  presignGetObject(input: S3PresignGetObjectInput): string {
    const target = this.target(input.bucket, input.key);
    return presignUrl({
      protocol: target.protocol,
      host: target.host,
      path: target.path,
      region: this.region,
      credentials: this.resolveCredentials(),
      expiresIn: input.expiresIn
    });
  }
}
