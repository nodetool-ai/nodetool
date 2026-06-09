import { materializeBrowserOutputs } from "../materializeBrowserOutputs";

const RAW_RGBA_MIME = "image/x-raw-rgba";

describe("materializeBrowserOutputs", () => {
  it("wraps an inline base64 image as a self-contained data-URL ref", () => {
    const out = materializeBrowserOutputs({
      output: { type: "image", data: "QUJD" }
    }) as { output: Record<string, unknown> };
    expect(out.output.uri).toBe("data:image/png;base64,QUJD");
    expect(out.output.data).toBeUndefined();
  });

  it("encodes a raw-RGBA ref to a PNG data URL via canvas", () => {
    const toDataURL = jest.fn(() => "data:image/png;base64,PNG");
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: jest.fn() }),
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

    const out = materializeBrowserOutputs({
      type: "image",
      mimeType: RAW_RGBA_MIME,
      data: new Uint8Array(2 * 2 * 4),
      width: 2,
      height: 2
    }) as Record<string, unknown>;

    expect(out.uri).toBe("data:image/png;base64,PNG");
    expect(out.data).toBeUndefined();
    expect(out.mimeType).toBe("image/png");
    spy.mockRestore();
  });

  it("materializes arrays of refs and leaves non-image values untouched", () => {
    const out = materializeBrowserOutputs({
      images: [
        { type: "image", data: "QQ==" },
        { type: "image", uri: "/api/storage/x.png" }
      ],
      count: 2,
      label: "hi"
    }) as { images: Array<Record<string, unknown>>; count: number; label: string };

    expect(out.images[0].uri).toBe("data:image/png;base64,QQ==");
    expect(out.images[0].data).toBeUndefined();
    // A ref that already carries only a uri passes through unchanged.
    expect(out.images[1].uri).toBe("/api/storage/x.png");
    expect(out.count).toBe(2);
    expect(out.label).toBe("hi");
  });

  it("preserves an already-prefixed data URL", () => {
    const out = materializeBrowserOutputs({
      type: "image",
      data: "data:image/jpeg;base64,ZZZ"
    }) as Record<string, unknown>;
    expect(out.uri).toBe("data:image/jpeg;base64,ZZZ");
    expect(out.data).toBeUndefined();
  });
});
