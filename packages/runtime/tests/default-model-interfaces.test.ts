/**
 * The process-wide model-interface default.
 *
 * Six hosts assembled these by hand and three forgot `createAsset`, so the
 * same workflow saved an image under `workflows run` and threw under `debug`.
 * The default is the floor every context gets; a context that wires its own
 * still wins.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProcessingContext,
  setDefaultModelInterfaces
} from "../src/context.js";

afterEach(() => {
  setDefaultModelInterfaces(null);
});

const bytes = new Uint8Array([1, 2, 3]);

describe("setDefaultModelInterfaces", () => {
  it("backstops a context that wired nothing", async () => {
    const createAsset = vi.fn(async () => ({ id: "asset-1" }));
    setDefaultModelInterfaces({ createAsset });

    const context = new ProcessingContext({ jobId: "j1", userId: "u1" });
    expect(context.hasModelInterface("createAsset")).toBe(true);
    await expect(
      context.createAsset({
        name: "out.png",
        contentType: "image/png",
        content: bytes
      })
    ).resolves.toEqual({ id: "asset-1" });
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", name: "out.png" })
    );
  });

  it("loses to a context that wired its own", async () => {
    setDefaultModelInterfaces({ createAsset: async () => ({ id: "default" }) });
    const context = new ProcessingContext({ jobId: "j2", userId: "u1" });
    context.setModelInterfaces({ createAsset: async () => ({ id: "own" }) });
    await expect(
      context.createAsset({
        name: "out.png",
        contentType: "image/png",
        content: bytes
      })
    ).resolves.toEqual({ id: "own" });
  });

  it("keeps the interfaces a context did not wire itself", async () => {
    const getTimelineSequence = vi.fn(async () => null);
    setDefaultModelInterfaces({
      createAsset: async () => ({ id: "default" }),
      getTimelineSequence
    });

    // The HTTP run route wires the asset pair and nothing else. Replacing the
    // floor wholesale uninstalled `getTimelineSequence`, so RenderTimeline
    // threw "model interface is not configured" over HTTP while running fine
    // from the editor.
    const context = new ProcessingContext({ jobId: "j4", userId: "u1" });
    context.setModelInterfaces({ createAsset: async () => ({ id: "own" }) });

    expect(context.hasModelInterface("getTimelineSequence")).toBe(true);
    await expect(
      context.getTimelineSequence("t1")
    ).resolves.toBeNull();
    expect(getTimelineSequence).toHaveBeenCalledWith({
      userId: "u1",
      id: "t1"
    });
    await expect(
      context.createAsset({
        name: "out.png",
        contentType: "image/png",
        content: bytes
      })
    ).resolves.toEqual({ id: "own" });
  });

  it("leaves a host that installed nothing exactly as it was", async () => {
    const context = new ProcessingContext({ jobId: "j3", userId: "u1" });
    expect(context.hasModelInterface("createAsset")).toBe(false);
    await expect(
      context.createAsset({
        name: "out.png",
        contentType: "image/png",
        content: bytes
      })
    ).rejects.toThrow(/'createAsset' is not configured/);
  });
});
