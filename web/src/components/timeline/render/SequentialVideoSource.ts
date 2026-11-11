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

/** Owns the decoded frame until the next frame replaces it or the clip is released. */
export class SequentialVideoSource {
  private readonly input: Input;
  private readonly sink: VideoSampleSink;
  private iterator: AsyncIterator<VideoSample> | null = null;
  private nextSample: VideoSample | null = null;
  private frame: VideoFrame | null = null;
  private timestamp = NaN;
  private closed = false;

  private constructor(input: Input, sink: VideoSampleSink) {
    this.input = input;
    this.sink = sink;
  }

  static async open(url: string, signal?: AbortSignal): Promise<SequentialVideoSource | null> {
    if (signal?.aborted) throw abortError();
    if (typeof VideoFrame === "undefined") return null;
    const result = await openDecodableVideoTrack(url, signal);
    if (!result.ok) return null;
    return new SequentialVideoSource(result.opened.input, result.opened.createSink(false));
  }

  async frameAt(timeSec: number, signal?: AbortSignal): Promise<VideoFrame> {
    if (this.closed || signal?.aborted) throw abortError();
    if (timeSec === this.timestamp && this.frame) return this.frame;
    // The optimized iterator decodes each packet once for monotonically
    // increasing timestamps. Reverse or retimed jumps use the seek fallback.
    if (needsDecodeRestart(this.timestamp, timeSec)) {
      throw new Error("Video timestamp left the sequential window");
    }
    const onAbort = () => this.dispose();
    signal?.addEventListener("abort", onAbort, { once: true });
    let sample: VideoSample | null = null;
    try {
      const iterator = this.iterator;
      if (!iterator) {
        sample = await this.sink.getSample(timeSec + TIMESTAMP_EPSILON_SEC);
        if (this.closed) throw abortError();
        if (!sample) throw new Error(`No decoded frame at ${timeSec}s`);
        this.iterator = this.sink.samples(sample.timestamp + Math.max(sample.duration / 2, 0.000001));
      } else {
        while (!this.nextSample || frameStartsBy(this.nextSample.timestamp, timeSec)) {
          if (this.nextSample) {
            sample?.close();
            sample = this.nextSample;
            this.nextSample = null;
          }
          const next = await iterator.next();
          if (next.done) break;
          if (this.closed) {
            next.value.close();
            throw abortError();
          }
          this.nextSample = next.value;
        }
      }
      if (this.closed) throw abortError();
      if (sample) {
        const frame = sample.toVideoFrame();
        this.frame?.close();
        this.frame = frame;
      }
      if (!this.frame) throw new Error(`No decoded frame at ${timeSec}s`);
      this.timestamp = timeSec;
      return this.frame;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      throw error;
    } finally {
      sample?.close();
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
    this.frame?.close();
    this.frame = null;
  }
}
