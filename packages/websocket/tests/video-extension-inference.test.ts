import { beforeEach, describe, expect, it, vi } from "vitest";
import { Asset } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { ExtendVideoParams } from "@nodetool-ai/runtime";
import { DirectInferenceHandler } from "../src/session/inference.js";
import type { DirectMediaGenerationRequest } from "../src/session/inference.js";
import { FakeClientSession } from "./fake-client-session.js";

const trim = vi.hoisted(() => vi.fn());
const generation = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/media.js", () => ({ trimVideoWindow: trim }));
vi.mock("../src/lib/asset-paths.js", () => ({
  retrieveAssetBytes: async () => new Uint8Array([1, 2, 3])
}));
vi.mock("../src/session/media-generation.js", () => ({
  createGenerationRun: () => ({
    generate: generation,
    seamAssetId: () => "extended-asset"
  })
}));

class ExtensionProvider extends BaseProvider {
  readonly calls: Array<{ source: Uint8Array; params: ExtendVideoParams }> = [];
  tasks = ["extend_video"];
  constructor() {
    super("fal_ai");
  }
  override async getAvailableVideoModels() {
    return [
      {
        id: "extension-model",
        name: "Extension",
        provider: "fal_ai",
        supportedTasks: this.tasks
      }
    ];
  }
  override async extendVideo(source: Uint8Array, params: ExtendVideoParams) {
    this.calls.push({ source, params });
    return new Uint8Array([8]);
  }
}

const request = (mode: "start" | "end"): DirectMediaGenerationRequest => ({
  mode: "video_extend",
  provider: "fal_ai",
  model: "extension-model",
  prompt: "Continue the pan",
  sourceAssetId: "source",
  durationSeconds: 3,
  extensionMode: mode,
  requestId: "request",
  sourceContext: {
    sequenceId: "sequence",
    clipId: "clip",
    sourceAssetId: "source",
    sourceStartMs: 40000,
    sourceEndMs: 48000,
    timelineStartMs: 5000,
    timelineDurationMs: 4000,
    speedMultiplier: 2
  }
});

function handler(provider: ExtensionProvider): DirectInferenceHandler {
  return new DirectInferenceHandler(
    new FakeClientSession({
      userId: "user",
      resolveProvider: async () => provider
    }),
    {
      defaults: { provider: "fal_ai", model: "extension-model" },
      currentRequestSeq: () => 1,
      registerAbort: () => () => {}
    }
  );
}

describe("direct video extension dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Asset, "find").mockResolvedValue(
      new Asset({
        id: "source",
        user_id: "user",
        name: "source",
        content_type: "video/mp4"
      })
    );
    trim.mockResolvedValue(new Uint8Array([4, 5]));
    generation.mockImplementation(
      async (_task, _params, _persist, execute: () => Promise<Uint8Array>) => ({
        output: await execute()
      })
    );
  });

  it.each(["start", "end"] as const)(
    "trims the source window and dispatches %s extension with added seconds",
    async (mode) => {
      const provider = new ExtensionProvider();
      await expect(
        handler(provider).runDirectMediaGeneration(request(mode))
      ).resolves.toEqual({ asset_ids: ["extended-asset"] });
      expect(trim).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        40000,
        48000
      );
      expect(provider.calls).toEqual([
        {
          source: new Uint8Array([4, 5]),
          params: {
            model: {
              id: "extension-model",
              name: "extension-model",
              provider: "fal_ai"
            },
            prompt: "Continue the pan",
            mode,
            durationSeconds: 3
          }
        }
      ]);
      expect(generation.mock.calls[0][0]).toBe("extend_video");
      expect(generation.mock.calls[0][1]).toMatchObject({
        mode,
        duration_seconds: 3,
        source_context: request(mode).sourceContext
      });
    }
  );

  it("rejects a video editor and invalid controls before materialization or spend", async () => {
    const provider = new ExtensionProvider();
    provider.tasks = ["video_to_video"];
    await expect(
      handler(provider).runDirectMediaGeneration(request("end"))
    ).rejects.toThrow(/extend_video task/);
    provider.tasks = ["extend_video"];
    for (const patch of [
      { extensionMode: undefined },
      { durationSeconds: 0 },
      { durationSeconds: NaN },
      { sourceContext: undefined },
      { variations: 2 }
    ]) {
      await expect(
        handler(provider).runDirectMediaGeneration({
          ...request("end"),
          ...patch
        })
      ).rejects.toThrow(/video_extend requires/);
    }
    expect(trim).not.toHaveBeenCalled();
    expect(generation).not.toHaveBeenCalled();
  });
});
