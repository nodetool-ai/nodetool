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
  private _buffer = Buffer.alloc(0);
  private readonly _maxFrameSize: number;

  constructor(options: FrameDecoderOptions = {}) {
    this._maxFrameSize = options.maxFrameSize ?? DEFAULT_MAX_BRIDGE_FRAME_SIZE;
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
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (this._buffer.length >= 4) {
      const length = this._buffer.readUInt32BE(0);
      if (length > this._maxFrameSize) {
        throw new FrameSizeError(length, this._maxFrameSize);
      }
      if (this._buffer.length < 4 + length) break; // incomplete frame
      const frame = this._buffer.subarray(4, 4 + length);
      this._buffer = this._buffer.subarray(4 + length);
      onFrame(frame);
    }
  }

  /** Drop any buffered partial frame. Call when the transport is torn down. */
  reset(): void {
    this._buffer = Buffer.alloc(0);
  }
}
