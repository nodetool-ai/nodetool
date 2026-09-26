import type { GameRenderFrame } from "@nodetool-ai/protocol";

export type GameRendererBackend = "webgpu" | "canvas2d";

export interface GameRendererEffect {
  readonly kind: "brightnessContrast";
  readonly brightness: number;
  readonly contrast: number;
  readonly required?: boolean;
}

export interface GameRendererCapabilities {
  readonly backend: GameRendererBackend;
  readonly core2D: true;
  readonly gpuEffects: boolean;
  readonly adapterType: "hardware" | "software" | "unknown";
  readonly deviceStatus: "ready" | "lost" | "disposed";
  readonly enabledFeatures: readonly string[];
  readonly requestedFeatures: readonly string[];
  readonly limits: { readonly maxTextureDimension2D: number; readonly maxBufferSize: number } | null;
  readonly minimalRenderSucceeded: boolean;
  readonly deviceLossCount: number;
  readonly fallbackReason: string | null;
}

export interface GameRendererStats {
  readonly backend: GameRendererBackend;
  readonly visibleSprites: number;
  readonly drawCalls: number;
  readonly uploadedBytes: number;
  readonly textureBytes: number;
  readonly targetBytes: number;
  readonly instanceBufferBytes: number;
}

export interface GameRenderer {
  readonly backend: GameRendererBackend;
  readonly canvas: HTMLCanvasElement;
  readonly capabilities: GameRendererCapabilities;
  render(frame: GameRenderFrame, interpolation: number): Promise<GameRendererStats>;
  setEffect(effect: GameRendererEffect | null): void;
  resize(width: number, height: number): void;
  invalidateAsset(assetId: string): void;
  dispose(): void;
}
