import type { NativeFrame, nativeGame2dAsset } from "@nodetool-ai/protocol/native-game";
import type { z } from "zod";

export type NativeAssetEntry = z.infer<typeof nativeGame2dAsset>;
export interface NativeAssetBroker {
  readonly entries: readonly NativeAssetEntry[];
  entry(id: string): NativeAssetEntry;
  dependencies(id: string): readonly NativeAssetEntry[];
  get(id: string): Promise<Uint8Array>;
  bytes(id: string): Promise<Uint8Array>;
  /** Cache-only copy. Unverified, released, and disposed sources cannot supply image descriptors. */
  verifiedRange(id: string, offset: number, length: number): Uint8Array;
  release(id: string): void;
  dispose(): void;
}
export interface NativeRenderer {
  render(frame: NativeFrame): void;
  /** Opt-in benchmark synchronization, never called during ordinary play. */
  finishFrame?(): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  dispose(): void;
}
export interface NativeRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly assets: NativeAssetBroker;
  readonly onContextLost?: () => void;
  readonly onContextRestored?: () => void;
  readonly onError?: (error: Error) => void;
}
