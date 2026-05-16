/**
 * Web worker for histogram computation. Receives an RGBA byte buffer,
 * returns four 256-entry Uint32Arrays packed back as transferable
 * ArrayBuffers.
 */

import { computeHistogramFromRgba } from "./computeHistogram";

interface HistogramRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
}

interface HistogramResponse {
  id: number;
  r: ArrayBuffer;
  g: ArrayBuffer;
  b: ArrayBuffer;
  luminance: ArrayBuffer;
  pixelCount: number;
}

self.addEventListener("message", (event: MessageEvent<HistogramRequest>) => {
  const { id, rgbaBuffer } = event.data;
  const rgba = new Uint8ClampedArray(rgbaBuffer);
  const hist = computeHistogramFromRgba(rgba);
  const response: HistogramResponse = {
    id,
    r: hist.r.buffer as ArrayBuffer,
    g: hist.g.buffer as ArrayBuffer,
    b: hist.b.buffer as ArrayBuffer,
    luminance: hist.luminance.buffer as ArrayBuffer,
    pixelCount: hist.pixelCount
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(response, [
    response.r,
    response.g,
    response.b,
    response.luminance
  ]);
});
