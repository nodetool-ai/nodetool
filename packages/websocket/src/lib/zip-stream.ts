/**
 * Streaming zip output for the export surfaces (timeline and storyboard zips).
 *
 * An export used to load every asset into memory and build the archive with
 * `zipSync`, so a timeline naming a two-hour video held the video, and then
 * the whole archive, in memory. Here each entry is written as it is read: a
 * local file (a managed asset under the local store, or an external asset in
 * place) is streamed from disk, and only a backend with no local file hands
 * over bytes. The archive itself goes out as a stream.
 *
 * fflate writes no Zip64 records, so an entry is limited to 4 GiB; callers
 * check {@link MAX_ZIP_ENTRY_BYTES} and leave a larger file out.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/** A local file to read in place. */
export interface LocalFileSource {
  path: string;
  size: number;
}

/** What an export entry reads from: bytes in memory or a local file. */
export type ExportSource = Uint8Array | LocalFileSource;

/** Largest entry fflate can write without Zip64. */
export const MAX_ZIP_ENTRY_BYTES = 0xffff_ffff;

export function isLocalFileSource(
  source: ExportSource
): source is LocalFileSource {
  return !(source instanceof Uint8Array);
}

export function exportSourceSize(source: ExportSource): number {
  return isLocalFileSource(source) ? source.size : source.byteLength;
}

/** Chunks of `source`, read from disk for a local file. */
async function* readSource(source: ExportSource): AsyncGenerator<Uint8Array> {
  if (!isLocalFileSource(source)) {
    yield source;
    return;
  }
  for await (const chunk of createReadStream(source.path)) {
    yield chunk as Buffer;
  }
}

/** Hex sha256 of `source`, streaming a local file. */
export async function sha256OfSource(source: ExportSource): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of readSource(source)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** Receives archive chunks in order and resolves when it can take more. */
export type ZipChunkSink = (chunk: Uint8Array) => Promise<void>;

/**
 * Writes zip entries one after another to a sink, waiting on the sink between
 * chunks so a slow reader holds back the file reads.
 */
export class ZipStreamWriter {
  private readonly zip: Zip;
  private pending: Uint8Array[] = [];
  private failure: Error | null = null;

  constructor(private readonly sink: ZipChunkSink) {
    this.zip = new Zip((err, chunk) => {
      if (err) {
        this.failure = err;
        return;
      }
      this.pending.push(chunk);
    });
  }

  private async flush(): Promise<void> {
    if (this.failure) throw this.failure;
    while (this.pending.length > 0) {
      const chunk = this.pending.shift()!;
      await this.sink(chunk);
    }
  }

  /**
   * Add one entry. `compress` deflates it, which suits text; media is already
   * compressed and is stored as-is.
   */
  async add(
    name: string,
    source: ExportSource,
    options: { compress?: boolean } = {}
  ): Promise<void> {
    const entry: ZipDeflate | ZipPassThrough = options.compress
      ? new ZipDeflate(name, { level: 6 })
      : new ZipPassThrough(name);
    this.zip.add(entry);
    for await (const chunk of readSource(source)) {
      entry.push(chunk, false);
      await this.flush();
    }
    entry.push(new Uint8Array(0), true);
    await this.flush();
  }

  /** Write the central directory. No entry may be added afterwards. */
  async finish(): Promise<void> {
    this.zip.end();
    await this.flush();
  }
}

/** Run `write` against a writer that collects the whole archive in memory. */
export async function collectZip(
  write: (writer: ZipStreamWriter) => Promise<void>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipStreamWriter(async (chunk) => {
    chunks.push(chunk);
  });
  await write(writer);
  await writer.finish();
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * A readable stream of the archive `write` produces. Writing starts at once
 * and waits whenever the reader falls behind; a failure or a reader that goes
 * away destroys the stream, which ends the download early.
 */
export function streamZip(
  write: (writer: ZipStreamWriter) => Promise<void>
): Readable {
  const out = new PassThrough();
  const sink: ZipChunkSink = (chunk) =>
    new Promise<void>((resolve, reject) => {
      if (out.destroyed) {
        reject(new Error("zip reader went away"));
        return;
      }
      if (out.write(chunk)) {
        resolve();
        return;
      }
      const onDrain = (): void => {
        out.off("close", onClose);
        resolve();
      };
      const onClose = (): void => {
        out.off("drain", onDrain);
        reject(new Error("zip reader went away"));
      };
      out.once("drain", onDrain);
      out.once("close", onClose);
    });
  const writer = new ZipStreamWriter(sink);
  void (async () => {
    await write(writer);
    await writer.finish();
    out.end();
  })().catch((err: unknown) => {
    out.destroy(err instanceof Error ? err : new Error(String(err)));
  });
  return out;
}
