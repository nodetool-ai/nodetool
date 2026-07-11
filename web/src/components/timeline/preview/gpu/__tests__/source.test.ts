import { isSourceReady, sourceDimensions } from "../source";

describe("isSourceReady", () => {
  it("returns true for a video element with readyState >= 2", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 2 });
    expect(isSourceReady(video)).toBe(true);
  });

  it("returns false for a video element with readyState < 2", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 1 });
    expect(isSourceReady(video)).toBe(false);
  });

  it("returns true for a complete image with positive naturalWidth", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    expect(isSourceReady(img)).toBe(true);
  });

  it("returns false for an incomplete image", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false });
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    expect(isSourceReady(img)).toBe(false);
  });

  it("returns false for a complete image with zero naturalWidth", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    expect(isSourceReady(img)).toBe(false);
  });

  it("returns true for a canvas-like source with positive width", () => {
    const source = { width: 640, height: 480 } as ImageBitmap;
    expect(isSourceReady(source)).toBe(true);
  });

  it("returns false for a canvas-like source with zero width", () => {
    const source = { width: 0, height: 0 } as ImageBitmap;
    expect(isSourceReady(source)).toBe(false);
  });
});

describe("sourceDimensions", () => {
  it("returns videoWidth/videoHeight for a video element", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "videoWidth", { value: 1920 });
    Object.defineProperty(video, "videoHeight", { value: 1080 });
    expect(sourceDimensions(video)).toEqual({ width: 1920, height: 1080 });
  });

  it("returns 0 dimensions for a video with no loaded source", () => {
    const video = document.createElement("video");
    expect(sourceDimensions(video)).toEqual({ width: 0, height: 0 });
  });

  it("returns naturalWidth/naturalHeight for an image element", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    expect(sourceDimensions(img)).toEqual({ width: 800, height: 600 });
  });

  it("returns width/height for a canvas-like source", () => {
    const source = { width: 512, height: 256 } as ImageBitmap;
    expect(sourceDimensions(source)).toEqual({ width: 512, height: 256 });
  });
});
