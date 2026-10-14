import type { Texture } from "three";
import type { GameAssetBinding3D } from "@nodetool-ai/protocol";

export interface PreparedGameImage3D {
  readonly bytes: Uint8Array;
  readonly binding: Extract<GameAssetBinding3D, { mediaKind: "image" }>;
}
export type DecodeGameImage3D = (image: PreparedGameImage3D, signal: AbortSignal) => Promise<Texture>;
export interface GameImageSources3D {
  readonly resolveImage?: (logicalId: string, signal: AbortSignal) => Promise<PreparedGameImage3D | null>;
  readonly decodeImage?: DecodeGameImage3D;
}
