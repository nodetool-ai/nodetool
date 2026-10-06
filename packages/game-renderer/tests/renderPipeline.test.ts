import { expect, it } from "vitest";
import { GameRenderPipeline } from "../src/renderPipeline.js";
import { WebGPURenderPipeline } from "../src/webgpu/pipeline.js";

it("orders registered passes and waits for asynchronous work before the next pass", async () => {
  const pipeline = new GameRenderPipeline<string[]>();
  pipeline.register({ name: "hud", order: 2, render: (calls) => { calls.push("hud"); } });
  pipeline.register({ name: "scene", order: 0, render: async (calls) => { await Promise.resolve(); calls.push("scene"); } });
  pipeline.register({ name: "overlay", order: 1, render: (calls) => { calls.push("overlay"); } });
  const calls: string[] = [];
  await pipeline.render(calls);
  expect(calls).toEqual(["scene", "overlay", "hud"]);
  expect(() => pipeline.register({ name: "hud", order: 3, render: () => {} })).toThrow("already registered");
});

it("preserves WebGPU lighting, sprite, effect and HUD pass order", async () => {
  const pipeline = new WebGPURenderPipeline();
  const calls: string[] = [];
  await pipeline.render({ lighting: () => { calls.push("lighting"); }, sprites: () => { calls.push("sprites"); },
    effects: () => { calls.push("effects"); }, hud: () => { calls.push("hud"); } });
  expect(calls).toEqual(["lighting", "sprites", "effects", "hud"]);
});
