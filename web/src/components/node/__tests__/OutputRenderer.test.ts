import { isAudioChunkLike, isTextLikeChunk } from "../outputChunkUtils";
import { rawRgbaToPngDataUrl } from "../OutputRenderer";

describe("rawRgbaToPngDataUrl", () => {
  it("sizes the canvas, draws the pixels, and returns the PNG data URL", () => {
    // jsdom has no real canvas backend, so mock one to assert the encode path.
    const putImageData = jest.fn();
    const toDataURL = jest.fn(() => "data:image/png;base64,AAAA");
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ putImageData }),
      toDataURL
    };
    const spy = jest
      .spyOn(document, "createElement")
      .mockReturnValue(canvas as unknown as HTMLCanvasElement);
    (globalThis as { ImageData?: unknown }).ImageData ??= class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    };

    const url = rawRgbaToPngDataUrl(new Uint8Array(2 * 2 * 4), 2, 2);

    expect(url).toBe("data:image/png;base64,AAAA");
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(2);
    expect(putImageData).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("returns an empty string when the 2D context is unavailable", () => {
    const canvas = { width: 0, height: 0, getContext: () => null };
    const spy = jest
      .spyOn(document, "createElement")
      .mockReturnValue(canvas as unknown as HTMLCanvasElement);
    expect(rawRgbaToPngDataUrl(new Uint8Array(4), 1, 1)).toBe("");
    spy.mockRestore();
  });
});

describe("OutputRenderer chunk classification", () => {
  it("detects Whisper-style audio chunks", () => {
    expect(
      isAudioChunkLike({
        timestamp: [0, 1.25],
        text: "hello world"
      })
    ).toBe(true);
  });

  it("rejects malformed Whisper-style audio chunks", () => {
    expect(
      isAudioChunkLike({
        timestamp: [0],
        text: "hello world"
      })
    ).toBe(false);
  });

  it("treats missing content_type as text for Python-style chunks", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "Hello",
        done: false,
      } as any)
    ).toBe(true);
  });

  it("treats explicit text content_type as text", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "Hello",
        content_type: "text",
        done: false,
      } as any)
    ).toBe(true);
  });

  it("does not treat audio chunks as text", () => {
    expect(
      isTextLikeChunk({
        type: "chunk",
        content: "AAA=",
        content_type: "audio",
        done: false,
      } as any)
    ).toBe(false);
  });
});
