import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { expect, it } from "vitest";
import { RecoveringGameRenderer } from "../src/browser.js";
import type { GameRenderer, GameRendererStats } from "../src/index.js";

it("waits for a frame to finish before rendering the next frame", async () => {
  const frame: GameRenderFrame = { tick: 1, width: 2, height: 2, pixelsPerUnit: 32,
    camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [], hud: [] };
  const stats: GameRendererStats = { backend: "webgpu", visibleSprites: 0, drawCalls: 0,
    uploadedBytes: 0, textureBytes: 0, targetBytes: 0, instanceBufferBytes: 0 };
  const pending: Array<(value: GameRendererStats) => void> = [];
  const current: GameRenderer = {
    backend: "webgpu",
    canvas: { width: 64, height: 64 } as unknown as HTMLCanvasElement,
    capabilities: { backend: "webgpu", core2D: true, gpuEffects: true, lighting: true,
      adapterType: "unknown", deviceStatus: "ready", enabledFeatures: [], requestedFeatures: [],
      limits: null, minimalRenderSucceeded: false, deviceLossCount: 0, fallbackReason: null },
    render: () => new Promise<GameRendererStats>((resolve) => { pending.push(resolve); }),
    setEffects: () => undefined,
    resize: () => undefined,
    invalidateAsset: () => undefined,
    dispose: () => undefined,
  };
  const renderer = new RecoveringGameRenderer(current, async () => null);
  const first = renderer.render(frame, 1);
  const second = renderer.render({ ...frame, tick: 2 }, 1);
  await Promise.resolve();
  expect(pending).toHaveLength(1);
  pending[0]?.(stats);
  await first;
  await Promise.resolve();
  expect(pending).toHaveLength(2);
  pending[1]?.(stats);
  await second;
});
