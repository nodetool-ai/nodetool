/**
 * Chrome native messaging framing: each message is a 4-byte little-endian
 * length followed by that many bytes of UTF-8 JSON.
 */

/** Largest message Chrome accepts from a native host (1 MiB). */
export const MAX_HOST_TO_CHROME_BYTES = 1024 * 1024;
/** Largest message Chrome sends to a native host (64 MiB). */
export const MAX_CHROME_TO_HOST_BYTES = 64 * 1024 * 1024;

/** Encode one JSON value as a native messaging frame. */
export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (body.length > MAX_HOST_TO_CHROME_BYTES) {
    throw new Error(
      `Native message of ${body.length} bytes exceeds Chrome's 1 MiB limit`
    );
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Incremental decoder: push stdin chunks, get complete JSON values back. */
export class NativeMessageDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_CHROME_TO_HOST_BYTES) {
        throw new Error(`Native message of ${length} bytes is too large`);
      }
      if (this.buffer.length < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      messages.push(JSON.parse(body.toString("utf8")));
    }
    return messages;
  }
}
