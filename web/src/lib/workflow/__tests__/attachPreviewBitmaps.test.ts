import { attachPreviewBitmaps } from "../attachPreviewBitmaps";

const RAW_RGBA_MIME = "image/x-raw-rgba";
const BITMAP_IMAGE_MIME = "image/x-imagebitmap";

const rawRef = (width = 2, height = 2) => ({
  type: "image",
  mimeType: RAW_RGBA_MIME,
  data: new Uint8Array(width * height * 4),
  width,
  height
});

describe("attachPreviewBitmaps", () => {
  const fakeBitmap = { width: 2, height: 2, close: jest.fn() };

  beforeEach(() => {
    (globalThis as { ImageData?: unknown }).ImageData = class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    };
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest
      .fn()
      .mockResolvedValue(fakeBitmap);
  });

  afterEach(() => {
    delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  });

  it("replaces a raw-RGBA ref with a transferable bitmap ref (data dropped)", async () => {
    const transfer: Transferable[] = [];
    const out = (await attachPreviewBitmaps(
      { output: rawRef() },
      transfer
    )) as { output: Record<string, unknown> };

    expect(out.output.bitmap).toBe(fakeBitmap);
    expect(out.output.mimeType).toBe(BITMAP_IMAGE_MIME);
    expect(out.output.data).toBeUndefined();
    expect(typeof out.output.bitmapVersion).toBe("number");
    expect(transfer).toEqual([fakeBitmap]);
  });

  it("assigns a fresh bitmapVersion per frame so memoized consumers re-render", async () => {
    const transfer: Transferable[] = [];
    const a = (await attachPreviewBitmaps(rawRef(), transfer)) as Record<
      string,
      unknown
    >;
    const b = (await attachPreviewBitmaps(rawRef(), transfer)) as Record<
      string,
      unknown
    >;
    expect(a.bitmapVersion).not.toBe(b.bitmapVersion);
  });

  it("recurses into arrays and nested objects", async () => {
    const transfer: Transferable[] = [];
    const out = (await attachPreviewBitmaps(
      { images: [rawRef(), { type: "image", uri: "/api/storage/x.png" }] },
      transfer
    )) as { images: Array<Record<string, unknown>> };

    expect(out.images[0].bitmap).toBe(fakeBitmap);
    expect(out.images[1].uri).toBe("/api/storage/x.png");
    expect(out.images[1].bitmap).toBeUndefined();
    expect(transfer).toHaveLength(1);
  });

  it("falls back to the unchanged raw ref when bitmap creation fails", async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest
      .fn()
      .mockRejectedValue(new Error("no bitmap support"));
    const transfer: Transferable[] = [];
    const ref = rawRef();
    const out = (await attachPreviewBitmaps(ref, transfer)) as Record<
      string,
      unknown
    >;
    expect(out).toBe(ref);
    expect(transfer).toHaveLength(0);
  });

  it("leaves non-image values untouched", async () => {
    const transfer: Transferable[] = [];
    const out = await attachPreviewBitmaps(
      { count: 3, label: "hi", bytes: new Uint8Array(4) },
      transfer
    );
    expect(out).toEqual({ count: 3, label: "hi", bytes: new Uint8Array(4) });
    expect(transfer).toHaveLength(0);
  });
});
