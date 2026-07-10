/**
 * Demultiplexer for Docker's non-TTY attach/logs stream.
 *
 * When a container runs without a TTY, the daemon multiplexes stdout and
 * stderr onto one connection using 8-byte frame headers:
 *
 *     [1 byte stream type][3 bytes zero][4 bytes big-endian payload length][payload]
 *
 * Stream type: 0 = stdin (never sent to clients), 1 = stdout, 2 = stderr.
 */

export type DemuxSlot = "stdout" | "stderr";

export type DemuxFrame = [DemuxSlot, Buffer];

const HEADER_LENGTH = 8;
const STDOUT_TYPE = 1;
const STDERR_TYPE = 2;

/**
 * Incremental frame parser. Feed raw chunks in any fragmentation (a frame
 * split across chunks, several frames in one chunk) and get back the frames
 * that are complete so far. Frames with an unknown stream type are dropped,
 * matching dockerode's demuxStream.
 */
export class DockerStreamDemuxer {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): DemuxFrame[] {
    this.buffer =
      this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    const frames: DemuxFrame[] = [];
    while (this.buffer.length >= HEADER_LENGTH) {
      const streamType = this.buffer[0];
      const payloadLength = this.buffer.readUInt32BE(4);
      if (this.buffer.length < HEADER_LENGTH + payloadLength) {
        break;
      }
      const payload = Buffer.from(
        this.buffer.subarray(HEADER_LENGTH, HEADER_LENGTH + payloadLength)
      );
      this.buffer = this.buffer.subarray(HEADER_LENGTH + payloadLength);
      if (streamType === STDOUT_TYPE) {
        frames.push(["stdout", payload]);
      } else if (streamType === STDERR_TYPE) {
        frames.push(["stderr", payload]);
      }
    }
    return frames;
  }

  /** Bytes held back waiting for the rest of a frame. */
  get pending(): number {
    return this.buffer.length;
  }
}

/**
 * Demux a readable attach stream into `[slot, payload]` frames.
 *
 * Stream errors end the iteration instead of throwing — attach sockets are
 * torn down forcibly when containers are removed, and consumers treat that
 * the same as a clean end.
 */
export async function* demuxDockerStream(
  stream: AsyncIterable<Buffer | string>
): AsyncGenerator<DemuxFrame, void> {
  const demuxer = new DockerStreamDemuxer();
  try {
    for await (const chunk of stream) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      yield* demuxer.push(buf);
    }
  } catch {
    // Treat abrupt socket teardown as end-of-stream.
  }
}
