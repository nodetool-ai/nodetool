/**
 * The two pieces of the AWS wire protocol the Bedrock provider needs without
 * the AWS SDK: Signature Version 4 request signing, and the binary
 * `application/vnd.amazon.eventstream` framing that `ConverseStream` answers
 * with.
 *
 * SigV4: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 * Event stream: https://docs.aws.amazon.com/AmazonS3/latest/API/RESTSelectObjectAppendix.html
 */
import { createHash, createHmac } from "node:crypto";
import { crc32 } from "node:zlib";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/** RFC 3986 percent-encoding, which `encodeURIComponent` falls short of. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** `20261013T160133Z` for a date. */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Sign a request for an AWS service with SigV4 and return the headers to send.
 * The path is canonicalised the way every non-S3 service expects: each
 * segment of the already-encoded path is encoded again.
 */
export function signAwsRequest(args: {
  method: string;
  url: URL;
  body: string;
  region: string;
  service: string;
  credentials: AwsCredentials;
  headers?: Record<string, string>;
  now?: Date;
}): Record<string, string> {
  const now = args.now ?? new Date();
  const timestamp = amzDate(now);
  const day = timestamp.slice(0, 8);
  const payloadHash = sha256Hex(args.body);

  const headers: Record<string, string> = {
    ...args.headers,
    host: args.url.host,
    "x-amz-date": timestamp
  };
  if (args.credentials.sessionToken) {
    headers["x-amz-security-token"] = args.credentials.sessionToken;
  }

  const canonicalHeaders = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = canonicalHeaders.map(([name]) => name).join(";");

  const canonicalPath =
    args.url.pathname
      .split("/")
      .map((segment) => encodeRfc3986(segment))
      .join("/") || "/";
  const canonicalQuery = [...args.url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort(([ak, av], [bk, bv]) =>
      ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1
    )
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    args.method.toUpperCase(),
    canonicalPath,
    canonicalQuery,
    canonicalHeaders.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders,
    payloadHash
  ].join("\n");

  const scope = `${day}/${args.region}/${args.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${args.credentials.secretAccessKey}`, day), args.region), args.service),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const { host: _host, ...sendable } = headers;
  return {
    ...sendable,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${args.credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

/** One decoded event-stream message: its string headers and raw payload. */
export interface EventStreamMessage {
  headers: Record<string, string>;
  payload: Uint8Array;
}

const PRELUDE_BYTES = 12;
const TRAILER_BYTES = 4;

/** Bytes a header value of each type occupies after its type byte, or -1 for length-prefixed types. */
const FIXED_HEADER_SIZES: Record<number, number> = {
  0: 0, // true
  1: 0, // false
  2: 1, // byte
  3: 2, // short
  4: 4, // integer
  5: 8, // long
  8: 8, // timestamp
  9: 16 // uuid
};

function decodeHeaders(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const headers: Record<string, string> = {};
  let offset = 0;
  while (offset < bytes.length) {
    const nameLength = view.getUint8(offset);
    offset += 1;
    const name = decoder.decode(bytes.subarray(offset, offset + nameLength));
    offset += nameLength;
    const type = view.getUint8(offset);
    offset += 1;
    if (type === 6 || type === 7) {
      const valueLength = view.getUint16(offset);
      offset += 2;
      if (type === 7) {
        headers[name] = decoder.decode(bytes.subarray(offset, offset + valueLength));
      }
      offset += valueLength;
      continue;
    }
    const size = FIXED_HEADER_SIZES[type];
    if (size === undefined) {
      throw new Error(`Bedrock event stream header ${name} has unknown type ${type}`);
    }
    offset += size;
  }
  return headers;
}

/**
 * Split a byte stream into event-stream messages. A message may arrive split
 * across network chunks, so bytes are buffered until a whole frame is present.
 * Both CRCs are checked: a corrupted frame fails loudly instead of decoding as
 * garbage.
 */
export async function* decodeEventStream(
  body: AsyncIterable<Uint8Array>
): AsyncGenerator<EventStreamMessage> {
  let buffer = new Uint8Array(0);
  for await (const chunk of body) {
    const merged = new Uint8Array(buffer.length + chunk.length);
    merged.set(buffer);
    merged.set(chunk, buffer.length);
    buffer = merged;

    while (buffer.length >= PRELUDE_BYTES) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const totalLength = view.getUint32(0);
      const headersLength = view.getUint32(4);
      if (totalLength < PRELUDE_BYTES + TRAILER_BYTES + headersLength) {
        throw new Error("Bedrock event stream frame has an invalid length");
      }
      if (crc32(buffer.subarray(0, 8)) !== view.getUint32(8)) {
        throw new Error("Bedrock event stream prelude checksum mismatch");
      }
      if (buffer.length < totalLength) break;
      if (crc32(buffer.subarray(0, totalLength - TRAILER_BYTES)) !== view.getUint32(totalLength - TRAILER_BYTES)) {
        throw new Error("Bedrock event stream message checksum mismatch");
      }
      const headersEnd = PRELUDE_BYTES + headersLength;
      yield {
        headers: decodeHeaders(buffer.subarray(PRELUDE_BYTES, headersEnd)),
        payload: buffer.slice(headersEnd, totalLength - TRAILER_BYTES)
      };
      buffer = buffer.slice(totalLength);
    }
  }
  if (buffer.length > 0) {
    throw new Error("Bedrock event stream ended mid-message");
  }
}

/** Encode one event-stream message with string headers. The inverse of {@link decodeEventStream}, for tests and fixtures. */
export function encodeEventStreamMessage(
  headers: Record<string, string>,
  payload: Uint8Array
): Uint8Array {
  const encoder = new TextEncoder();
  const headerParts: number[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = encoder.encode(name);
    const valueBytes = encoder.encode(value);
    headerParts.push(nameBytes.length, ...nameBytes, 7, valueBytes.length >> 8, valueBytes.length & 0xff, ...valueBytes);
  }
  const headerBytes = Uint8Array.from(headerParts);
  const total = PRELUDE_BYTES + headerBytes.length + payload.length + TRAILER_BYTES;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headerBytes.length);
  view.setUint32(8, crc32(out.subarray(0, 8)));
  out.set(headerBytes, PRELUDE_BYTES);
  out.set(payload, PRELUDE_BYTES + headerBytes.length);
  view.setUint32(total - TRAILER_BYTES, crc32(out.subarray(0, total - TRAILER_BYTES)));
  return out;
}
