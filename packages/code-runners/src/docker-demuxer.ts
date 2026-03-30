import type { Socket } from "net";

type StreamSlot = "stdout" | "stderr";

/**
 * Demultiplex Docker's hijacked SocketIO stream.
 * The frame format when TTY is disabled:
 *     [1 byte stream][3 bytes 0][4 bytes length][payload]
 */
export class DockerHijackMultiplexDemuxer {
  private readonly _sock: Socket;
  private _buffer: Buffer;

  constructor(sock: Socket) {
    this._sock = sock;
    this._buffer = Buffer.alloc(0);
  }

  send(data: Buffer): void {
    this._sock.write(data);
  }

  closeStdin(): void {
    try {
      this._sock.end();
    } catch {
      // suppress
    }
  }

  feedData(chunk: Buffer): void {
    this._buffer = Buffer.concat([this._buffer, chunk]);
  }

  drain(): Array<[StreamSlot, Buffer]> {
    const frames: Array<[StreamSlot, Buffer]> = [];
    while (this._buffer.length >= 8) {
      const streamType = this._buffer[0];
      const length = this._buffer.readUInt32BE(4);
      if (this._buffer.length < 8 + length) {
        break;
      }
      const payload = this._buffer.subarray(8, 8 + length);
      this._buffer = this._buffer.subarray(8 + length);
      if (streamType === 1) {
        frames.push(["stdout", Buffer.from(payload)]);
      } else if (streamType === 2) {
        frames.push(["stderr", Buffer.from(payload)]);
      }
    }
    return frames;
  }

  *iterFrames(): Generator<[StreamSlot, Buffer], void, undefined> {
    const frames = this.drain();
    for (const frame of frames) {
      yield frame;
    }
  }
}

export default DockerHijackMultiplexDemuxer;
