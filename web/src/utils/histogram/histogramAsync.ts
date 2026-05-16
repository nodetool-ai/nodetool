/**
 * Async histogram API used by LevelsBody. For images larger than the
 * threshold (1024² = 1_048_576 pixels), computation is offloaded to a
 * dedicated web worker; smaller images run on the main thread.
 */

import {
  computeHistogramFromRgba,
  type ImageHistogram
} from "./computeHistogram";

const WORKER_THRESHOLD_PIXELS = 1024 * 1024;

interface HistogramWorkerResponse {
  id: number;
  r: ArrayBuffer;
  g: ArrayBuffer;
  b: ArrayBuffer;
  luminance: ArrayBuffer;
  pixelCount: number;
}

export interface HistogramRequest {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

export function computeHistogramAsync(
  request: HistogramRequest
): Promise<ImageHistogram> {
  const pixelCount = request.width * request.height;

  // Small image or no Worker support → run inline.
  if (pixelCount < WORKER_THRESHOLD_PIXELS || typeof Worker === "undefined") {
    return Promise.resolve(computeHistogramFromRgba(request.rgba));
  }

  return new Promise<ImageHistogram>((resolve, reject) => {
    const worker = new Worker(
      new URL("./histogramWorker.ts", import.meta.url),
      { type: "module" }
    );

    const handleMessage = (event: MessageEvent<HistogramWorkerResponse>) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.terminate();
      resolve({
        r: new Uint32Array(event.data.r),
        g: new Uint32Array(event.data.g),
        b: new Uint32Array(event.data.b),
        luminance: new Uint32Array(event.data.luminance),
        pixelCount: event.data.pixelCount
      });
    };

    const handleError = (event: ErrorEvent) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.terminate();
      reject(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Histogram worker failed")
      );
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);

    const { buffer, byteOffset, byteLength } = request.rgba;
    const rgbaBuffer = buffer.slice(byteOffset, byteOffset + byteLength);
    worker.postMessage({ id: 1, rgbaBuffer }, [rgbaBuffer]);
  });
}
