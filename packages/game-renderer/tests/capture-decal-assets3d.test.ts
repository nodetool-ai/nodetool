import { createCanvas } from "@napi-rs/canvas";
import { expect, it, vi } from "vitest";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import { captureGameFrame3D } from "../src/node3d.js";
import { blockoutFrame } from "./fixtures/game3d.js";

// Asset staging precedes optional browser loading. Keep this contract independent of Chromium.
vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/config")>();
  return { ...original, importOptionalModule: async () => { throw new Error("Browser boundary reached"); } };
});

async function fixture() {
  const bytes = new Uint8Array(createCanvas(2, 3).toBuffer("image/png"));
  const result = await prepareGameImage3D(bytes, { assetId: "paint" });
  if (!result.ok) { throw new Error("Image preparation failed"); }
  const frame = blockoutFrame();
  const receiver = frame.entities[0];
  if (!receiver) { throw new Error("Fixture receiver is missing"); }
  frame.entities.push({ entityId: "projector", transform: receiver.transform, previousTransform: receiver.previousTransform,
    decal3d: { assetId: "paint", receiverId: receiver.entityId, size: { x: 1, y: 1, z: 1 }, opacity: 1, renderOrder: 0 } });
  frame.images = { paint: result.image.binding };
  return { frame, bytes };
}

it("stages the image of a decal-only entity before reaching the browser boundary", async () => {
  const { frame, bytes } = await fixture();
  const requested: string[] = [];
  await expect(captureGameFrame3D(frame, { resolveAsset: async (slot) => {
    requested.push(slot);
    return bytes;
  } })).rejects.toThrow("3D capture requires the locally installed Playwright browser runtime");
  expect(requested).toEqual(["paint"]);
});

it("rejects a missing decal image binding before browser loading", async () => {
  const { frame, bytes } = await fixture();
  delete frame.images;
  await expect(captureGameFrame3D(frame, { resolveAsset: async () => bytes }))
    .rejects.toThrow("Missing capture image binding paint");
});

it("rejects missing decal bytes through the existing capture asset contract", async () => {
  const { frame } = await fixture();
  await expect(captureGameFrame3D(frame, { resolveAsset: async () => null }))
    .rejects.toThrow("Missing capture asset paint");
});

it("deduplicates an image shared by a decal and material without staging unrelated bindings", async () => {
  const { frame, bytes } = await fixture();
  const receiver = frame.entities[0];
  if (!receiver?.primitive) { throw new Error("Fixture primitive is missing"); }
  receiver.primitive.material.baseColorTexture = { assetId: "paint" };
  frame.images = { ...frame.images, unrelated: { ...frame.images!.paint!, assetId: "other" } };
  const requested: string[] = [];
  await expect(captureGameFrame3D(frame, { resolveAsset: async (slot) => {
    requested.push(slot);
    return bytes;
  } })).rejects.toThrow("3D capture requires the locally installed Playwright browser runtime");
  expect(requested).toEqual(["paint"]);
});
