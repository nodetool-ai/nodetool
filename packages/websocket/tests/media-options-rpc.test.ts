/**
 * Integration test for the tRPC `models.mediaOptions` procedure.
 *
 * `mediaOptions` reports the per-model output constraints — aspect ratios,
 * resolutions, and (for video) clip durations — the media pickers use to offer
 * only values the endpoint accepts. It resolves the provider, looks up the
 * model by id, and surfaces its declared arrays (empty/null when the model
 * declares none or isn't found). This drives it through the tRPC caller with a
 * fake provider.
 *
 * Note: `mediaOptions` is a tRPC query, not a WebSocket command, so this
 * mirrors the `trpc-models.test.ts` caller harness (createCaller + makeCtx +
 * a fake provider via the mocked `getProvider`) rather than the MockWebSocket
 * scaffolding from `generate-media-rpc.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock @nodetool-ai/runtime ─────────────────────────────────────────────────
// mediaOptions resolves a provider via isProviderConfigured + getProvider; both
// are faked so the test stays hermetic (no secret store, no real providers).

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    isProviderConfigured: vi.fn(),
    getProvider: vi.fn()
  };
});

import { isProviderConfigured, getProvider } from "@nodetool-ai/runtime";

// ── Helpers ────────────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

interface MockImageModel {
  id: string;
  name: string;
  provider: string;
  aspectRatios?: string[];
  resolutions?: string[];
}

interface MockVideoModel {
  id: string;
  name: string;
  provider: string;
  aspectRatios?: string[];
  resolutions?: string[];
  durations?: number[];
}

/** Minimal provider instance exposing only the image/video model getters. */
function makeProvider(
  overrides: Partial<{
    getAvailableImageModels: () => Promise<MockImageModel[]>;
    getAvailableVideoModels: () => Promise<MockVideoModel[]>;
  }> = {}
) {
  return {
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("models.mediaOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: provider is configured but resolves to nothing; each test
    // overrides getProvider with a fake exposing the models it needs.
    (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces an image model's aspect ratios and resolutions (durations null)", async () => {
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeProvider({
        getAvailableImageModels: vi.fn().mockResolvedValue([
          {
            id: "m",
            name: "M",
            provider: "fake",
            aspectRatios: ["16:9", "1:1"],
            resolutions: ["1K"]
          }
        ])
      })
    );
    const caller = createCaller(makeCtx());
    const result = await caller.models.mediaOptions({
      provider: "fake",
      model: "m",
      task: "image"
    });
    expect(result).toEqual({
      aspectRatios: ["16:9", "1:1"],
      resolutions: ["1K"],
      durations: null
    });
  });

  it("surfaces a video model's durations", async () => {
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeProvider({
        getAvailableVideoModels: vi.fn().mockResolvedValue([
          {
            id: "m",
            name: "M",
            provider: "fake",
            aspectRatios: ["16:9"],
            resolutions: ["720p"],
            durations: [5, 10]
          }
        ])
      })
    );
    const caller = createCaller(makeCtx());
    const result = await caller.models.mediaOptions({
      provider: "fake",
      model: "m",
      task: "video"
    });
    expect(result).toEqual({
      aspectRatios: ["16:9"],
      resolutions: ["720p"],
      durations: [5, 10]
    });
  });

  it("returns empty arrays and null durations for an unknown model id", async () => {
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeProvider({
        getAvailableImageModels: vi.fn().mockResolvedValue([
          {
            id: "other",
            name: "Other",
            provider: "fake",
            aspectRatios: ["4:3"],
            resolutions: ["2K"]
          }
        ])
      })
    );
    const caller = createCaller(makeCtx());
    const result = await caller.models.mediaOptions({
      provider: "fake",
      model: "does-not-exist",
      task: "image"
    });
    expect(result).toEqual({
      aspectRatios: [],
      resolutions: [],
      durations: null
    });
  });
});
