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

interface PendingRequest {
  resolve: (hist: ImageHistogram) => void;
  reject: (err: Error) => void;
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

interface HistogramWorkerResponse {
  id: number;
  r: ArrayBuffer;
  g: ArrayBuffer;
  b: ArrayBuffer;
  luminance: ArrayBuffer;
  pixelCount: number;
}

function handleWorkerMessage(
  event: MessageEvent<HistogramWorkerResponse>
): void {
  const p = pending.get(event.data.id);
  if (!p) return;
  pending.delete(event.data.id);
  p.resolve({
    r: new Uint32Array(event.data.r),
    g: new Uint32Array(event.data.g),
    b: new Uint32Array(event.data.b),
    luminance: new Uint32Array(event.data.luminance),
    pixelCount: event.data.pixelCount
  });
}

function handleWorkerError(event: ErrorEvent): void {
  const err =
    event.error instanceof Error
      ? event.error
      : new Error(event.message || "Histogram worker failed");
  for (const [, p] of pending) {
    p.reject(err);
  }
  pending.clear();
  workerInstance = null;
}

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("./histogramWorker.ts", import.meta.url),
      { type: "module" }
    );
    workerInstance.addEventListener("message", handleWorkerMessage);
    workerInstance.addEventListener("error", handleWorkerError);
  }
  return workerInstance;
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

  const worker = getWorker();
  const id = nextRequestId++;
  return new Promise<ImageHistogram>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const { buffer, byteOffset, byteLength } = request.rgba;
    const rgbaBuffer = buffer.slice(
      byteOffset,
      byteOffset + byteLength
    ) as ArrayBuffer;
    worker.postMessage({ id, rgbaBuffer }, [rgbaBuffer]);
  });
}
