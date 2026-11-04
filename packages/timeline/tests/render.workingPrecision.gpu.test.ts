import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";

it("keeps default and explicit RGBA8 byte delivery identical", async () => {
  const device = await getNodeGPUDevice();
  const implicit = new HeadlessFrameCompositor(device, 3, 2);
  const explicit = new HeadlessFrameCompositor(device, 3, 2, { workingFormat: "rgba8unorm" });
  try {
    expect(await implicit.renderFrame([])).toEqual(await explicit.renderFrame([]));
  } finally {
    implicit.dispose();
    explicit.dispose();
  }
});
