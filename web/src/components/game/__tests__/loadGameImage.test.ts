import { loadGameImage } from "../loadGameImage";

describe("loadGameImage", () => {
  const originalFetch = global.fetch;
  const originalCreateImageBitmap = (global as { createImageBitmap?: unknown }).createImageBitmap;
  const bitmap = { width: 4, height: 2 } as ImageBitmap;
  let createImageBitmapMock: jest.Mock;

  beforeEach(() => {
    createImageBitmapMock = jest.fn(async () => bitmap);
    Object.assign(global, { createImageBitmap: createImageBitmapMock });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.assign(global, { createImageBitmap: originalCreateImageBitmap });
  });

  it("fetches a signed URL in CORS mode and decodes a bitmap instead of a tainted <img>", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const fetchMock = jest.fn(async () => ({ ok: true, blob: async () => blob }) as unknown as Response);
    global.fetch = fetchMock;
    const imageSpy = jest.spyOn(global, "Image");
    const url = "https://example.supabase.co/storage/v1/object/sign/nodetool-assets/acorn.png?token=t";

    await expect(loadGameImage(url)).resolves.toBe(bitmap);

    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ mode: "cors" }));
    expect(createImageBitmapMock).toHaveBeenCalledWith(blob, { premultiplyAlpha: "none" });
    expect(imageSpy).not.toHaveBeenCalled();
    imageSpy.mockRestore();
  });

  it("returns null for an expired URL or a failed decode", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400 }) as unknown as Response);
    await expect(loadGameImage("https://example.test/expired.png")).resolves.toBeNull();
    expect(createImageBitmapMock).not.toHaveBeenCalled();

    global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob([]) }) as unknown as Response);
    createImageBitmapMock.mockRejectedValueOnce(new Error("decode failed"));
    await expect(loadGameImage("https://example.test/broken.png")).resolves.toBeNull();
  });
});
