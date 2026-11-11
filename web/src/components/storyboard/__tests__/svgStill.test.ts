import {
  SVG_STILL_SIDE,
  isSvgUrl,
  stillPixelSize,
  svgRasterSize
} from "../svgStill";

describe("isSvgUrl", () => {
  it("reads the extension off the path, ignoring a query or hash", () => {
    expect(isSvgUrl("/api/storage/u/abc.svg")).toBe(true);
    expect(isSvgUrl("https://bucket.example/u/abc.SVG?X-Amz-Signature=1")).toBe(true);
    expect(isSvgUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(true);
    expect(isSvgUrl("/api/storage/u/abc.png")).toBe(false);
    expect(isSvgUrl("https://bucket.example/u/abc.png?name=x.svg")).toBe(false);
  });
});

describe("svgRasterSize", () => {
  it("scales the longest side to the still size and keeps the aspect", () => {
    expect(svgRasterSize(32, 18)).toEqual({
      width: SVG_STILL_SIDE,
      height: Math.round((SVG_STILL_SIDE * 18) / 32)
    });
    expect(svgRasterSize(3000, 6000)).toEqual({
      width: SVG_STILL_SIDE / 2,
      height: SVG_STILL_SIDE
    });
  });

  it("renders a document with no readable size square", () => {
    expect(svgRasterSize(0, 0)).toEqual({
      width: SVG_STILL_SIDE,
      height: SVG_STILL_SIDE
    });
  });
});

describe("stillPixelSize", () => {
  const image = (width: number, height: number): HTMLImageElement =>
    ({ naturalWidth: width, naturalHeight: height, width, height }) as HTMLImageElement;

  it("keeps a raster still's own pixels", () => {
    expect(stillPixelSize(image(640, 360), "/s/a.png")).toEqual({
      width: 640,
      height: 360
    });
  });

  it("renders an SVG still at the still size, not its declared size", () => {
    expect(stillPixelSize(image(24, 24), "/s/a.svg")).toEqual({
      width: SVG_STILL_SIDE,
      height: SVG_STILL_SIDE
    });
  });
});
