import { BoxHelper } from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameRenderer3D, type GameRendererCapabilities3D, type GameRendererStats3D, type GameProjectedBounds3D } from "./index.js";

export interface GameCapturePageInput3D {
  readonly frame: GameRenderFrame3D;
  readonly interpolation: number;
  readonly width: number;
  readonly height: number;
  readonly boundsOverlay?: boolean;
  readonly camera?: GameRenderFrame3D["camera"];
  readonly assets: Readonly<Record<string, { readonly base64: string; readonly digest?: string }>>;
}
export interface GameCapturePageReport3D {
  readonly capabilities: GameRendererCapabilities3D;
  readonly stats: GameRendererStats3D;
  readonly projectedBounds: readonly GameProjectedBounds3D[];
}
declare global {
  interface Window {
    captureNativeGame3D: (input: GameCapturePageInput3D) => Promise<GameCapturePageReport3D>;
  }
}

window.captureNativeGame3D = async (input) => {
  const canvas = document.querySelector("canvas");
  if (!canvas) { throw new Error("Capture canvas is missing"); }
  const controller = new AbortController();
  const renderer = await createGameRenderer3D({ canvas, signal: controller.signal, preserveDrawingBuffer: true,
    resolveFont: async (logicalId) => {
      const asset = input.assets[logicalId];
      return asset ? { bytes: Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0)), digest: asset.digest } : null;
    },
    resolveModel: async (logicalId) => {
      const asset = input.assets[logicalId];
      if (!asset) { return null; }
      return { bytes: Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0)), digest: asset.digest };
    } });
  try {
    renderer.resize(input.width, input.height);
    renderer.setCameraOverride(input.camera ?? null);
    let stats = await renderer.render(input.frame, input.interpolation);
    const helpers: BoxHelper[] = [];
    try {
      if (input.boundsOverlay) {
        for (const entity of input.frame.entities) {
          const object = renderer.getEntityObject(entity.entityId);
          if (!object) { continue; }
          const helper = new BoxHelper(object, "#ffc432");
          helper.material.depthTest = true;
          renderer.getScene().add(helper);
          helpers.push(helper);
        }
        stats = await renderer.render(input.frame, input.interpolation);
      }
      return { capabilities: renderer.capabilities, stats, projectedBounds: renderer.projectedBounds() };
    } finally {
      helpers.forEach((helper) => { helper.removeFromParent(); helper.geometry.dispose(); helper.material.dispose(); });
    }
  } finally { renderer.dispose(); }
};
