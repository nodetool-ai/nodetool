import { applyLumaToAlpha } from "../segmentMaskOverlay";

/** One RGBA pixel per entry, as a canvas ImageData buffer holds them. */
function pixels(...rgba: Array<[number, number, number, number]>) {
  return new Uint8ClampedArray(rgba.flat());
}

describe("applyLumaToAlpha", () => {
  it("turns an opaque white-on-black mask into an alpha mask", () => {
    // What fal's SAM endpoints return: alpha 255 everywhere, so compositing it
    // straight kept every pixel and the cutout contained the whole layer.
    const data = pixels([255, 255, 255, 255], [0, 0, 0, 255]);

    applyLumaToAlpha(data);

    expect(data[3]).toBe(255);
    expect(data[7]).toBe(0);
  });

  it("keeps a mask that already carries its shape in alpha", () => {
    const data = pixels([255, 255, 255, 255], [255, 255, 255, 0]);

    applyLumaToAlpha(data);

    expect(data[3]).toBe(255);
    expect(data[7]).toBe(0);
  });

  it("drops the black ground of a mask padded with transparency", () => {
    // A mask transformed into document space: padding in alpha, shape in luma.
    const data = pixels(
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 0]
    );

    applyLumaToAlpha(data);

    expect([data[3], data[7], data[11]]).toEqual([255, 0, 0]);
  });

  it("carries a soft edge through as partial alpha", () => {
    const data = pixels([128, 128, 128, 255]);

    applyLumaToAlpha(data);

    expect(data[3]).toBe(128);
  });

  it("paints every pixel white so the alpha alone carries the mask", () => {
    const data = pixels([12, 34, 56, 255]);

    applyLumaToAlpha(data);

    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });
});
