import { createHash } from "node:crypto";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameFonts3D } from "../src/renderer3d/hud/fonts.js";
import { blockoutFrame } from "./fixtures/game3d.js";

const registered = new Set<unknown>();
class FakeFontFace {
  constructor(readonly family: string) {}
  async load(): Promise<this> { return this; }
}
beforeEach(() => {
  registered.clear();
  vi.stubGlobal("FontFace", FakeFontFace);
  vi.stubGlobal("document", { fonts: { add: (face: unknown) => registered.add(face), delete: (face: unknown) => registered.delete(face) } });
});
afterEach(() => { vi.unstubAllGlobals(); });

function fontFrame(bytes: Uint8Array, required = true): GameRenderFrame3D {
  return { ...blockoutFrame(), fonts: { display: { assetId: "font", mediaKind: "font", fontFormat: "ttf", required,
    digest: createHash("sha256").update(bytes).digest("hex") } } };
}

it("evicts superseded font faces for the same slot across ten binding edits", async () => {
  let bytes = new Uint8Array([1]);
  const resolveFont = vi.fn(async () => ({ bytes }));
  const fonts = new GameFonts3D({ canvas: {} as HTMLCanvasElement, resolveFont }, new AbortController(), []);
  await fonts.load(fontFrame(bytes));
  await fonts.load(fontFrame(bytes));
  expect(resolveFont).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 10; index++) {
    bytes = new Uint8Array([index + 2]);
    await fonts.load(fontFrame(bytes));
    expect(registered.size).toBe(1);
  }
  fonts.dispose();
  expect(registered.size).toBe(0);
});

it("evicts removed faces and forgets removed optional-font failures", async () => {
  const bytes = new Uint8Array([1]);
  const resolveFont = vi.fn<NonNullable<import("../src/browser3d.js").CreateGameRenderer3DOptions["resolveFont"]>>()
    .mockResolvedValueOnce(null).mockResolvedValue({ bytes });
  const fonts = new GameFonts3D({ canvas: {} as HTMLCanvasElement, resolveFont }, new AbortController(), []);
  await fonts.load(fontFrame(bytes, false));
  await fonts.load(blockoutFrame());
  await fonts.load(fontFrame(bytes, false));
  expect(registered.size).toBe(1);
  expect(resolveFont).toHaveBeenCalledTimes(2);
  await fonts.load(blockoutFrame());
  expect(registered.size).toBe(0);
});

it("retries an optional failure when the binding becomes required with the same digest", async () => {
  const bytes = new Uint8Array([1]);
  const resolveFont = vi.fn<NonNullable<import("../src/browser3d.js").CreateGameRenderer3DOptions["resolveFont"]>>()
    .mockResolvedValueOnce(null).mockResolvedValue({ bytes });
  const fonts = new GameFonts3D({ canvas: {} as HTMLCanvasElement, resolveFont }, new AbortController(), []);
  await fonts.load(fontFrame(bytes, false));
  await fonts.load(fontFrame(bytes, true));
  expect(resolveFont).toHaveBeenCalledTimes(2);
  expect(registered.size).toBe(1);
});
