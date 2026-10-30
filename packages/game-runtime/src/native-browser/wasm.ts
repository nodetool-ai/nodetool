import { nativeRuntimeResponse, type NativeRuntimeResponse } from "@nodetool-ai/protocol/native-game";
import { z } from "zod";

// Exact allocation-free fallback compiled in native/game/src/browser/Bridge.cpp.
const emergencyResponse = z.strictObject({ protocolVersion: z.literal(1), requestId: z.literal(""), status: z.literal("error"),
  error: z.strictObject({ code: z.literal("resource_limit"), message: z.literal("Interface memory budget exhausted"), path: z.literal("") }) });

/** Only the static allocation-free fallback can borrow the already validated in-flight identity. */
export function nativeWasmResponse(value: unknown, requestId: string): NativeRuntimeResponse {
  const emergency = emergencyResponse.safeParse(value);
  const response = nativeRuntimeResponse.parse(emergency.success ? { ...emergency.data, requestId } : value);
  if (response.requestId !== requestId) { throw new Error("Native dispatcher request ID mismatch"); }
  return response;
}

/** The browser adapter owns this module and never exports borrowed WASM views. */
export interface NativeWasmModule {
  readonly HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _ng_create(): number;
  _ng_dispatch(context: number, pointer: number, bytes: number): number;
  _ng_response_pointer(context: number): number;
  _ng_response_length(context: number): number;
  _ng_destroy(context: number): void;
  readonly FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, bytes: Uint8Array): void;
    unlink(path: string): void;
  };
}

export const NATIVE_BROWSER_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class NativeWasmDispatcher {
  private context: number;
  constructor(private readonly module: NativeWasmModule) {
    this.context = module._ng_create();
    if (!this.context) { throw new Error("Native WASM dispatcher creation failed"); }
  }

  dispatch(request: unknown): unknown {
    if (!this.context) { throw new Error("Native WASM dispatcher is closed"); }
    const bytes = encoder.encode(JSON.stringify(request));
    if (bytes.byteLength > NATIVE_BROWSER_MAX_MESSAGE_BYTES) { throw new Error("Native request exceeds byte budget"); }
    const pointer = this.module._malloc(bytes.byteLength || 1);
    if (!pointer) { throw new Error("Native request allocation failed"); }
    try {
      this.module.HEAPU8.set(bytes, pointer);
      const status = this.module._ng_dispatch(this.context, pointer, bytes.byteLength);
      if (status !== 0 && status !== 1) { throw new Error("Native WASM dispatcher rejected its context"); }
      const resultPointer = this.module._ng_response_pointer(this.context);
      const length = this.module._ng_response_length(this.context);
      const heap = this.module.HEAPU8;
      if (!Number.isSafeInteger(length) || length < 1 || length > NATIVE_BROWSER_MAX_MESSAGE_BYTES ||
          resultPointer < 0 || resultPointer + length > heap.byteLength) { throw new Error("Invalid native response byte range"); }
      // Memory can grow during dispatch. Read the current heap and copy before free or another call.
      const result = heap.slice(resultPointer, resultPointer + length);
      return JSON.parse(decoder.decode(result));
    } finally { this.module._free(pointer); }
  }

  close(): void {
    if (this.context) { this.module._ng_destroy(this.context); this.context = 0; }
  }
}
