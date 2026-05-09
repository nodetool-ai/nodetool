/// <reference lib="webworker" />

import {
  magicWandFromRgba,
  magicWandNonContiguousFromRgba
} from "./selectionMask";

interface MagicWandWorkerRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerance: number;
  contiguous: boolean;
}

interface MagicWandWorkerResponse {
  id: number;
  maskBuffer?: ArrayBuffer;
  error?: string;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<MagicWandWorkerRequest>) => {
  try {
    const rgba = new Uint8ClampedArray(event.data.rgbaBuffer);
    const imageData = {
      width: event.data.width,
      height: event.data.height,
      data: rgba
    } as ImageData;
    const mask = event.data.contiguous
      ? magicWandFromRgba(
          imageData,
          event.data.seedX,
          event.data.seedY,
          event.data.tolerance
        )
      : magicWandNonContiguousFromRgba(
          imageData,
          event.data.seedX,
          event.data.seedY,
          event.data.tolerance
        );

    const mb = mask.byteOffset + mask.byteLength;
    const maskBuffer = mask.buffer.slice(mask.byteOffset, mb) as ArrayBuffer;
    const response: MagicWandWorkerResponse = {
      id: event.data.id,
      maskBuffer
    };
    workerScope.postMessage(response, [maskBuffer]);
  } catch (error) {
    const response: MagicWandWorkerResponse = {
      id: event.data.id,
      error: error instanceof Error ? error.message : "Magic wand worker failed"
    };
    workerScope.postMessage(response);
  }
});

export {};
