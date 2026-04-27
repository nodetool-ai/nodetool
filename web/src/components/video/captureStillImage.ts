export interface CapturedImageRef {
  type: "image";
  data: string;
  mimeType: "image/png";
  width: number;
  height: number;
}

export const captureStillImage = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement = document.createElement("canvas")
): CapturedImageRef | null => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, width, height);
  return {
    type: "image",
    data: canvas.toDataURL("image/png"),
    mimeType: "image/png",
    width,
    height
  };
};
