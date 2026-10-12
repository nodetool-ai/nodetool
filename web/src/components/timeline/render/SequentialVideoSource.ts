import type { Input, VideoSample, VideoSampleSink } from "mediabunny";
import {
  frameStartsBy,
  needsDecodeRestart,
  openDecodableVideoTrack,
  TIMESTAMP_EPSILON_SEC
} from "./clipDecoder";

function abortError(): DOMException {
  return new DOMException("Video decode aborted", "AbortError");
}

/** One decoder and one displayed bitmap for an export clip. */
export class SequentialVideoSource {
  private readonly input: Input;
  private readonly sink: VideoSampleSink;
  private iterator: AsyncIterator<VideoSample> | null = null;
  private nextSample: VideoSample | null = null;
  private bitmap: ImageBitmap | null = null;
  private timestamp = NaN;
  private closed = false;

  private constructor(input: Input, sink: VideoSampleSink) {
    this.input = input;
    this.sink = sink;
  }

  static async open(url: string, signal?: AbortSignal): Promise<SequentialVideoSource | null> {
    if (signal?.aborted) throw abortError();
    if (typeof createImageBitmap === "undefined") return null;
    const result = await openDecodableVideoTrack(url, signal);
    if (!result.ok) return null;
    return new SequentialVideoSource(result.opened.input, result.opened.createSink(false));
  }

  async frameAt(timeSec: number, signal?: AbortSignal): Promise<ImageBitmap> {
    if (this.closed || signal?.aborted) throw abortError();
    if (timeSec === this.timestamp && this.bitmap) return this.bitmap;
    // The optimized iterator decodes each packet once for monotonically
    // increasing timestamps. Reverse or retimed jumps use the seek fallback.
    if (needsDecodeRestart(this.timestamp, timeSec)) {
      throw new Error("Video timestamp left the sequential window");
    }
    const onAbort = () => this.dispose();
    signal?.addEventListener("abort", onAbort, { once: true });
    let sample: VideoSample | null = null;
    try {
      if (!this.iterator) {
        sample = await this.sink.getSample(timeSec + TIMESTAMP_EPSILON_SEC);
        if (!sample) throw new Error(`No decoded frame at ${timeSec}s`);
        this.iterator = this.sink.samples(sample.timestamp + Math.max(sample.duration / 2, 0.000001));
      } else {
        if (!this.nextSample) {
          const next = await this.iterator.next();
          this.nextSample = next.done ? null : next.value;
        }
        while (this.nextSample && frameStartsBy(this.nextSample.timestamp, timeSec)) {
          sample?.close();
          sample = this.nextSample;
          const next = await this.iterator.next();
          this.nextSample = next.done ? null : next.value;
        }
      }
      if (this.closed || signal?.aborted) {
        sample?.close();
        sample = null;
        throw abortError();
      }
      if (!sample) {
        if (!this.bitmap) throw new Error(`No decoded frame at ${timeSec}s`);
        this.timestamp = timeSec;
        return this.bitmap;
      }
      let frame: VideoFrame | null = null;
      try {
        frame = sample.toVideoFrame();
        const bitmap = await createImageBitmap(frame as VideoFrame);
        if (this.closed || signal?.aborted) {
          bitmap.close();
          throw abortError();
        }
        this.bitmap?.close();
        this.bitmap = bitmap;
        this.timestamp = timeSec;
        return bitmap;
      } finally {
        frame?.close();
        sample.close();
        sample = null;
      }
    } catch (error) {
      sample?.close();
      if (signal?.aborted) throw abortError();
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const iterator = this.iterator;
    this.iterator = null;
    if (iterator?.return) void iterator.return().catch(() => undefined);
    this.input.dispose();
    this.nextSample?.close();
    this.nextSample = null;
    this.bitmap?.close();
    this.bitmap = null;
  }
}
