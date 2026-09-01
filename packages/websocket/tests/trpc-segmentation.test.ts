/**
 * segmentation router — the direct provider call the sketch editor's Segment
 * tool makes instead of running a one-node workflow.
 *
 * The provider is scripted, so what is covered here is the glue the router
 * owns: auth, provider resolution, prompt forwarding, mask encoding, the
 * per-user in-flight cap, and the rule that no image and no mask reaches the
 * log line.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BaseProvider } from "@nodetool-ai/runtime";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  isProviderConfigured: vi.fn(async () => true),
  getSecret: vi.fn(async () => "test-key"),
  logs: [] as Array<{ level: string; message: string; args: unknown[] }>
}));

vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  const record = (level: string) =>
    (message: string, ...args: unknown[]) =>
      mocks.logs.push({ level, message, args });
  return {
    ...actual,
    createLogger: (name: string) =>
      name === "nodetool.websocket.trpc.segmentation"
        ? {
            debug: record("debug"),
            info: record("info"),
            warn: record("warn"),
            error: record("error")
          }
        : actual.createLogger(name)
  };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: mocks.getProvider,
    isProviderConfigured: mocks.isProviderConfigured
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, getSecret: mocks.getSecret };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { resetSegmentationInFlight } from "../src/trpc/routers/segmentation.js";
import type { Context } from "../src/trpc/context.js";

/** One pixel of PNG, as the browser would send it. */
const IMAGE = Buffer.from("pretend-png-bytes").toString("base64");
const MASK_BYTES = new Uint8Array([1, 2, 3, 4]);

const REQUEST = {
  image: IMAGE,
  imageMimeType: "image/png",
  provider: "scripted",
  model: "scripted/sam",
  prompt: "hand"
};

interface SegmentCall {
  image: Uint8Array;
  params: Record<string, unknown>;
}

/** Provider that records the call and answers with one labelled mask. */
function scriptedProvider(calls: SegmentCall[]): BaseProvider {
  return {
    provider: "scripted",
    async segmentImage(image: Uint8Array, params: Record<string, unknown>) {
      calls.push({ image, params });
      return [
        {
          mask: MASK_BYTES,
          mimeType: "image/png",
          width: 256,
          height: 128,
          label: "hand",
          confidence: 0.9
        }
      ];
    }
  } as unknown as BaseProvider;
}

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  } as Context;
}

describe("segmentation router", () => {
  let calls: SegmentCall[];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logs.length = 0;
    mocks.isProviderConfigured.mockResolvedValue(true);
    mocks.getSecret.mockResolvedValue("test-key");
    resetSegmentationInFlight();
    calls = [];
    mocks.getProvider.mockResolvedValue(scriptedProvider(calls));
  });

  it("calls the provider's segmentImage and returns base64 masks", async () => {
    const result = await createCaller(makeCtx()).segmentation.segment(REQUEST);

    expect(result.provider).toBe("scripted");
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0]).toEqual({
      data: Buffer.from(MASK_BYTES).toString("base64"),
      mimeType: "image/png",
      width: 256,
      height: 128,
      label: "hand",
      confidence: 0.9,
      box: null
    });
  });

  it("decodes the image and forwards every prompt kind", async () => {
    await createCaller(makeCtx()).segmentation.segment({
      ...REQUEST,
      points: [{ x: 10, y: 20, include: true }],
      box: { x: 1, y: 2, width: 3, height: 4 },
      maxMasks: 5,
      minConfidence: 0.25
    });

    expect(Buffer.from(calls[0].image).toString("utf8")).toBe(
      "pretend-png-bytes"
    );
    expect(calls[0].params).toMatchObject({
      model: { id: "scripted/sam", provider: "scripted" },
      prompt: "hand",
      points: [{ x: 10, y: 20, include: true }],
      box: { x: 1, y: 2, width: 3, height: 4 },
      maxMasks: 5,
      minConfidence: 0.25
    });
  });

  it("passes no prompt through as null rather than as an empty string", async () => {
    await createCaller(makeCtx()).segmentation.segment({
      image: IMAGE,
      provider: "scripted",
      model: "scripted/sam"
    });

    expect(calls[0].params).toMatchObject({
      prompt: null,
      points: null,
      box: null
    });
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      createCaller(makeCtx({ userId: null })).segmentation.segment(REQUEST)
    ).rejects.toThrow(/Authentication required/);
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("refuses a provider this install has no key for", async () => {
    mocks.isProviderConfigured.mockResolvedValue(false);

    await expect(
      createCaller(makeCtx()).segmentation.segment(REQUEST)
    ).rejects.toThrow(/is not configured/);
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("surfaces the provider's own failure message", async () => {
    mocks.getProvider.mockResolvedValue({
      provider: "scripted",
      segmentImage: async () => {
        throw new Error("scripted/sam rejected the credentials (401).");
      }
    } as unknown as BaseProvider);

    await expect(
      createCaller(makeCtx()).segmentation.segment(REQUEST)
    ).rejects.toThrow(/rejected the credentials \(401\)/);
  });

  it("releases the in-flight slot after a failed call", async () => {
    mocks.getProvider.mockResolvedValueOnce({
      provider: "scripted",
      segmentImage: async () => {
        throw new Error("boom");
      }
    } as unknown as BaseProvider);
    const caller = createCaller(makeCtx());

    await expect(caller.segmentation.segment(REQUEST)).rejects.toThrow("boom");
    mocks.getProvider.mockResolvedValue(scriptedProvider(calls));

    await expect(caller.segmentation.segment(REQUEST)).resolves.toMatchObject({
      provider: "scripted"
    });
  });

  it("caps concurrent segmentations per user", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.getProvider.mockResolvedValue({
      provider: "scripted",
      segmentImage: async () => {
        await gate;
        return [];
      }
    } as unknown as BaseProvider);
    const caller = createCaller(makeCtx());

    const held = [
      caller.segmentation.segment(REQUEST),
      caller.segmentation.segment(REQUEST),
      caller.segmentation.segment(REQUEST)
    ];
    // Let all three acquire their slot before the fourth asks for one.
    await new Promise((resolve) => setImmediate(resolve));

    await expect(caller.segmentation.segment(REQUEST)).rejects.toThrow(
      /Another segmentation is already running/
    );

    release();
    await Promise.all(held);
  });

  it("logs the model and the mask count, never the pixels", async () => {
    await createCaller(makeCtx()).segmentation.segment(REQUEST);

    const line = mocks.logs.find((l) => l.message === "segmentation finished");
    expect(line?.args[0]).toMatchObject({
      provider: "scripted",
      model: "scripted/sam",
      maskCount: 1
    });
    expect(JSON.stringify(mocks.logs)).not.toContain(IMAGE);
    expect(JSON.stringify(mocks.logs)).not.toContain(
      Buffer.from(MASK_BYTES).toString("base64")
    );
  });
});
