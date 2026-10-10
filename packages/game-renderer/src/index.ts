import type { GameRenderEffect, GameRenderFrame } from "@nodetool-ai/protocol";
import type { GameParticleField } from "./particles/render2d.js";
export { gameKeyAction } from "./input.js";
export { projectedCamera } from "./frame.js";
export * from "./particles/index.js";
export * from "./frame-budget.js";

export type GameRendererBackend = "webgpu" | "canvas2d";

export type GameRendererEffect = GameRenderEffect;
export type GameHudEffectOrder = "beforeEffects" | "afterEffects";

export interface GameRendererCapabilities {
  readonly backend: GameRendererBackend;
  readonly core2D: true;
  readonly gpuEffects: boolean;
  readonly lighting: boolean;
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
  /** Draws the frame, with `particles` interleaved into the sprite layers when given. */
  render(frame: GameRenderFrame, interpolation: number, particles?: GameParticleField): Promise<GameRendererStats>;
  setEffects(effects: readonly GameRendererEffect[], hudOrder?: GameHudEffectOrder): void;
  resize(width: number, height: number): void;
  invalidateAsset(assetId: string): void;
  dispose(): void;
}

export { FixedTickClock } from "./fixed-tick-host.js";
export { GameInput3D } from "./input3d.js";
export { browserGamepads, GameInput, type GamepadLike, type TouchInputState } from "./input-bindings.js";
export * from "./ui/index.js";
