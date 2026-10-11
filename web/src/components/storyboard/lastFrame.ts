/**
 * Decodes one frame of a clip in the browser: the final one, so the next shot
 * can start where this one ends, or any other, as a reference for a derived
 * shot. The frame keeps the video's own resolution: a still that a clip render
 * animates must not be a downscaled thumbnail.
 */

/** How far before the end to seek. The very last timestamp can decode black. */
const END_OFFSET_SECONDS = 0.05;

export function captureLastFrame(url: string, name: string): Promise<File> {
  return captureFrameAt(url, Number.POSITIVE_INFINITY, name);
}

/**
 * The frame at `seconds` into the clip, clamped to the clip's length. Past the
 * end it is the last frame that decodes.
 */
export function captureFrameAt(
  url: string,
  seconds: number,
  name: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const finish = (result: File | Error): void => {
      video.removeAttribute("src");
      video.load();
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    video.addEventListener(
      "loadedmetadata",
      () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          finish(new Error("The clip has no duration"));
          return;
        }
        video.addEventListener(
          "seeked",
          () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            if (!context) {
              finish(new Error("The browser has no 2D canvas"));
              return;
            }
            try {
              context.drawImage(video, 0, 0);
              canvas.toBlob((blob) => {
                finish(
                  blob
                    ? new File([blob], name, { type: "image/png" })
                    : new Error("The frame could not be encoded")
                );
              }, "image/png");
            } catch (error) {
              finish(error instanceof Error ? error : new Error(String(error)));
            }
          },
          { once: true }
        );
        video.currentTime = Math.max(
          0,
          Math.min(seconds, video.duration - END_OFFSET_SECONDS)
        );
      },
      { once: true }
    );
    video.addEventListener(
      "error",
      () => finish(new Error("The clip could not be loaded")),
      { once: true }
    );
    video.src = url;
  });
}
