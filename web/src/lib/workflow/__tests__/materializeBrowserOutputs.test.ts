import {
  materializeBrowserOutputs,
  materializeBitmapRefs
} from "../materializeBrowserOutputs";

const RAW_RGBA_MIME = "image/x-raw-rgba";
const BITMAP_IMAGE_MIME = "image/x-imagebitmap";

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

  it("passes preview-bitmap refs through untouched (zero-copy display path)", () => {
    const bitmap = { width: 2, height: 2 };
    const ref = {
      type: "image",
      mimeType: BITMAP_IMAGE_MIME,
      bitmap,
      bitmapVersion: 7,
      width: 2,
      height: 2,
      data: undefined
    };
    const out = materializeBrowserOutputs({ output: ref }) as {
      output: Record<string, unknown>;
    };
    expect(out.output.bitmap).toBe(bitmap);
    expect(out.output.bitmapVersion).toBe(7);
    expect(out.output.uri).toBeUndefined();
    expect(out.output.mimeType).toBe(BITMAP_IMAGE_MIME);
  });

  it("materializeBitmapRefs converts bitmap refs to portable data-URL refs", () => {
    const toDataURL = jest.fn(() => "data:image/png;base64,PNG");
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: jest.fn() }),
      toDataURL
    };
    const spy = jest
      .spyOn(document, "createElement")
      .mockReturnValue(canvas as unknown as HTMLCanvasElement);

    const out = materializeBitmapRefs({
      graph: {
        nodes: [
          {
            data: {
              properties: {
                image: {
                  type: "image",
                  mimeType: BITMAP_IMAGE_MIME,
                  bitmap: { width: 2, height: 2 },
                  bitmapVersion: 3,
                  width: 2,
                  height: 2
                }
              }
            }
          }
        ]
      }
    }) as {
      graph: {
        nodes: Array<{
          data: { properties: { image: Record<string, unknown> } };
        }>;
      };
    };

    const ref = out.graph.nodes[0].data.properties.image;
    expect(ref.uri).toBe("data:image/png;base64,PNG");
    expect(ref.mimeType).toBe("image/png");
    expect(ref.bitmap).toBeUndefined();
    expect(ref.bitmapVersion).toBeUndefined();
    spy.mockRestore();
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
