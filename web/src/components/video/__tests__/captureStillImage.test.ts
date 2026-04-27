import { captureStillImage } from "../captureStillImage";

describe("captureStillImage", () => {
  it("captures the current video frame as a normal image ref", () => {
    const getContext = jest.fn(() => ({
      drawImage: jest.fn()
    }));
    const toDataURL = jest.fn(() => "data:image/png;base64,captured");
    const canvas = {
      width: 0,
      height: 0,
      getContext,
      toDataURL
    } as unknown as HTMLCanvasElement;
    const video = {
      videoWidth: 640,
      videoHeight: 360
    } as HTMLVideoElement;

    const image = captureStillImage(video, canvas);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(getContext).toHaveBeenCalledWith("2d");
    expect(toDataURL).toHaveBeenCalledWith("image/png");
    expect(image).toEqual({
      type: "image",
      data: "data:image/png;base64,captured",
      mimeType: "image/png",
      width: 640,
      height: 360
    });
  });

  it("returns null when the video has no frame dimensions", () => {
    const video = {
      videoWidth: 0,
      videoHeight: 0
    } as HTMLVideoElement;

    expect(captureStillImage(video)).toBeNull();
  });
});
