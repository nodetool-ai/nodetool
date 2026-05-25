import {
  magicWandFromRgba,
  magicWandNonContiguousFromRgba
} from "./selectionMask";

export interface MagicWandSelectionRequest {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerance: number;
  contiguous: boolean;
}

interface MagicWandWorkerRequest extends Omit<MagicWandSelectionRequest, "rgba"> {
  id: number;
  rgbaBuffer: ArrayBuffer;
}

interface MagicWandWorkerResponse {
  id: number;
  maskBuffer?: ArrayBuffer;
  error?: string;
}

function createAbortError(): Error {
  const error = new Error("Magic wand request aborted");
  error.name = "AbortError";
  return error;
}

function computeMagicWandSelection(
  request: MagicWandSelectionRequest
): Uint8ClampedArray {
  const imageData = {
    width: request.width,
    height: request.height,
    data: request.rgba
  } as ImageData;

  return request.contiguous
    ? magicWandFromRgba(
        imageData,
        request.seedX,
        request.seedY,
        request.tolerance
      )
    : magicWandNonContiguousFromRgba(
        imageData,
        request.seedX,
        request.seedY,
        request.tolerance
      );
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  {
    resolve: (mask: Uint8ClampedArray) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortHandler?: () => void;
  }
>();

function handleWorkerMessage(event: MessageEvent<MagicWandWorkerResponse>): void {
  const pending = pendingRequests.get(event.data.id);
  if (!pending) {
    return;
  }
  pendingRequests.delete(event.data.id);
  if (pending.signal && pending.abortHandler) {
    pending.signal.removeEventListener("abort", pending.abortHandler);
  }
  if (event.data.error) {
    pending.reject(new Error(event.data.error));
    return;
  }
  pending.resolve(new Uint8ClampedArray(event.data.maskBuffer ?? new ArrayBuffer(0)));
}

function handleWorkerError(event: ErrorEvent): void {
  const error = event.error instanceof Error
    ? event.error
    : new Error(event.message || "Magic wand worker failed");
  for (const [, pending] of pendingRequests) {
    pending.reject(error);
  }
  pendingRequests.clear();
  workerInstance = null;
}

function getMagicWandWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("./magicWandWorker.ts", import.meta.url),
      { type: "module" }
    );
    workerInstance.addEventListener("message", handleWorkerMessage);
    workerInstance.addEventListener("error", handleWorkerError);
  }
  return workerInstance;
}

export function runMagicWandSelectionAsync(
  request: MagicWandSelectionRequest,
  signal?: AbortSignal
): Promise<Uint8ClampedArray> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  if (typeof Worker === "undefined") {
    return Promise.resolve(computeMagicWandSelection(request));
  }

  const worker = getMagicWandWorker();
  const id = nextRequestId++;

  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    const abortHandler = () => {
      pendingRequests.delete(id);
      reject(createAbortError());
    };

    pendingRequests.set(id, { resolve, reject, signal, abortHandler });
    signal?.addEventListener("abort", abortHandler, { once: true });

    const { buffer: srcBuf, byteOffset, byteLength } = request.rgba;
    const rgbaBuffer = srcBuf.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;

    const message: MagicWandWorkerRequest = {
      id,
      rgbaBuffer,
      width: request.width,
      height: request.height,
      seedX: request.seedX,
      seedY: request.seedY,
      tolerance: request.tolerance,
      contiguous: request.contiguous
    };
    worker.postMessage(message, [message.rgbaBuffer]);
  });
}
