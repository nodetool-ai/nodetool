import type { DataTexture } from "three";
import type { GameAssetBinding3D } from "@nodetool-ai/protocol";
import type { GameModelDiagnostic } from "../preparation.js";

export interface PreparedGameHdri3D {
  readonly bytes: Uint8Array;
  readonly binding: Extract<GameAssetBinding3D, { mediaKind: "hdri" }>;
}
export interface PrepareGameHdriOptions3D {
  readonly assetId: string;
  readonly expectedDigest?: string;
  readonly signal?: AbortSignal;
}
export type PrepareGameHdriBinding3D = (
  bytes: Uint8Array, options: PrepareGameHdriOptions3D
) => Promise<
  | { readonly ok: true; readonly hdri: PreparedGameHdri3D }
  | { readonly ok: false; readonly diagnostics: readonly GameModelDiagnostic[] }
>;
export type DecodeGameHdri3D = (
  hdri: PreparedGameHdri3D, signal: AbortSignal
) => Promise<DataTexture>;
