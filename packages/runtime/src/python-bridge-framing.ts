/**
 * Shared length-prefixed msgpack framing for the Python bridge's stdio
 * transport: `[4-byte big-endian length][msgpack payload]`.
 *
 * This is the ONLY place that encodes/decodes the wire framing. Both the real
 * {@link "./python-stdio-bridge.js".PythonStdioBridge} and its faithful test
 * fake (`tests/fixtures/fake-python-stdio-worker.ts`) import this module so
 * the two can never drift apart — a framing bug fixed here fixes both.
 *
 * The WebSocket transport (`python-websocket-bridge.ts`) does NOT use this
 * module: one WS binary message already is one frame, with no length prefix.
 */

/** Default frame-size ceiling, mirrored by `NODETOOL_BRIDGE_MAX_FRAME_SIZE`. */
export const DEFAULT_MAX_BRIDGE_FRAME_SIZE = 256 * 1024 * 1024;

/**
 * Thrown by {@link FrameDecoder.push} when a declared frame length exceeds the
 * configured ceiling. Callers typically treat this as a fatal protocol
 * desync (the most common cause is the worker writing non-protocol bytes —
 * e.g. a stray `print()` — to stdout).
 */
export class FrameSizeError extends Error {
  constructor(
    public readonly length: number,
    public readonly maxFrameSize: number
  ) {
    super(
      `Incoming Python bridge frame exceeds max size (${length} > ${maxFrameSize})`
    );
    this.name = "FrameSizeError";
  }
}

/**
 * Encode one msgpack-packed payload into a length-prefixed wire frame:
 * `[4-byte big-endian length][payload]`.
 */
export function encodeFrame(payload: Buffer | Uint8Array): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

export interface FrameDecoderOptions {
  /** Reject any frame whose declared length exceeds this. */
  maxFrameSize?: number;
}

/**
 * Incremental decoder for the length-prefixed frame stream. Feed it raw bytes
 * as they arrive (from a socket/pipe `"data"` event) via {@link push}; it
 * buffers partial frames and returns every frame that became complete,
 * including the case where a single chunk contains multiple frames.
 *
 * Stateful and NOT reentrant-safe across a torn-down transport — call
 * {@link reset} (or construct a fresh instance) when the underlying
 * connection is replaced, so a stale partial frame from the old connection
 * can't desync the new one.
 */
export class FrameDecoder {
  /**
   * Bytes received but not yet returned as frames, kept as the chunks they
   * arrived in. They are concatenated once, when a frame is complete, so a
   * large frame read in many pipe chunks costs linear time rather than one
   * full copy per chunk.
   */
  private _chunks: Buffer[] = [];
  private _length = 0;
  private readonly _maxFrameSize: number;

  constructor(options: FrameDecoderOptions = {}) {
    this._maxFrameSize = options.maxFrameSize ?? DEFAULT_MAX_BRIDGE_FRAME_SIZE;
  }

  /** Merge the buffered chunks into one and return it. */
  private _coalesce(): Buffer {
    if (this._chunks.length !== 1) {
      this._chunks = [Buffer.concat(this._chunks, this._length)];
    }
    return this._chunks[0]!;
  }

  /**
   * Append `chunk` to the internal buffer and extract every complete frame
   * now available, invoking `onFrame` with each raw (still msgpack-packed)
   * payload as soon as it is extracted — in arrival order, before any later
   * frame in the same chunk is even looked at. This matters when a chunk
   * contains one or more valid frames followed by a corrupt length prefix:
   * every frame extracted before the corrupt one has already reached
   * `onFrame` by the time {@link FrameSizeError} is thrown, so a caller
   * dispatching responses from `onFrame` does not lose them.
   *
   * Throws {@link FrameSizeError} — leaving the decoder's buffer untouched
   * beyond the append — when a declared length exceeds the configured
   * ceiling.
   */
  push(chunk: Buffer, onFrame: (frame: Buffer) => void): void {
    if (chunk.length > 0) {
      this._chunks.push(chunk);
      this._length += chunk.length;
    }
    while (this._length >= 4) {
      // The length prefix may straddle chunks; merging is cheap here because
      // it only happens while fewer than 4 bytes sit in the first chunk.
      if (this._chunks[0]!.length < 4) this._coalesce();
      const length = this._chunks[0]!.readUInt32BE(0);
      if (length > this._maxFrameSize) {
        throw new FrameSizeError(length, this._maxFrameSize);
      }
      if (this._length < 4 + length) break; // incomplete frame
      const buffer = this._coalesce();
      const frame = buffer.subarray(4, 4 + length);
      const rest = buffer.subarray(4 + length);
      this._chunks = rest.length > 0 ? [rest] : [];
      this._length = rest.length;
      onFrame(frame);
    }
  }

  /** Drop any buffered partial frame. Call when the transport is torn down. */
  reset(): void {
    this._chunks = [];
    this._length = 0;
  }
}
