import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  audioBytesAsync,
  encodeWav,
  GainNode_,
  parseWavBytes,
  requireAudioBytes,
  toBytes
} from "@nodetool-ai/audio-nodes";

const OWNER = "audio-owner";
const WAV = encodeWav(new Float32Array([0.125, -0.25, 0.375, -0.5]), 24000, 1);
let context: ProcessingContext;
let owned: Asset;
let foreign: Asset;
let storageUri: string;

beforeEach(async () => {
  initTestDb();
  owned = await Asset.create<Asset>({
    user_id: OWNER,
    name: "tone.wav",
    content_type: "audio/wav"
  });
  foreign = await Asset.create<Asset>({
    user_id: "other-owner",
    name: "foreign.wav",
    content_type: "audio/wav"
  });
  const storage = new InMemoryStorageAdapter();
  storageUri = await storage.store(
    `${OWNER}/${owned.id}.wav`,
    WAV,
    "audio/wav"
  );
  await storage.store(`other-owner/${foreign.id}.wav`, WAV, "audio/wav");
  // Raw fallback keys must not make a rejected owned-asset lookup readable.
  await storage.store(`/api/storage/${foreign.id}.wav`, WAV, "audio/wav");
  context = new ProcessingContext({
    jobId: "audio-parity",
    userId: OWNER,
    storage,
    assetStorage: storage,
    fetchFn: async () => new Response(null, { status: 404 }),
    modelInterfaces: {
      getAssetInfo: async ({ userId, assetId }) => {
        const asset = await Asset.find(userId, assetId);
        return asset
          ? {
              id: asset.id,
              name: asset.name,
              content_type: asset.content_type,
              metadata: asset.metadata
            }
          : null;
      }
    }
  });
});

afterEach(() => {
  ModelObserver.clear();
  vi.restoreAllMocks();
});

describe("audio asset reference execution parity", () => {
  it("executes Gain directly with an ID-only reference", async () => {
    const resolver = vi.spyOn(context, "resolveAssetBytes");
    const result = await new GainNode_({
      audio: { type: "audio", uri: "", asset_id: owned.id },
      gain_db: -6.020599913279624
    }).process(context);
    const output = parseWavBytes(toBytes(result.output.data));
    expect(output?.samples[0]).toBeCloseTo(0.0625, 4);
    expect(resolver).toHaveBeenCalledWith(`asset://${owned.id}`, {
      requireOwnedAsset: true
    });
  });

  it.each(["inline", "storage", "id", "asset URI", "empty inline"])(
    "loads and applies gain to %s audio",
    async (form) => {
      const ref =
        form === "inline"
          ? { type: "audio", uri: "", data: WAV }
          : form === "storage"
            ? { type: "audio", uri: storageUri }
            : form === "asset URI"
              ? { type: "audio", uri: `asset://${owned.id}` }
              : {
                  type: "audio",
                  uri: "",
                  asset_id: owned.id,
                  ...(form === "empty inline" ? { data: new Uint8Array() } : {})
                };
      const resolver = vi.spyOn(context, "resolveAssetBytes");
      const input = parseWavBytes(await audioBytesAsync(ref, context));
      expect(input).not.toBeNull();
      expect(input?.samples).toEqual(parseWavBytes(WAV)?.samples);
      const result = await new GainNode_({
        audio: ref,
        gain_db: -6.020599913279624
      }).process(context);
      expect(Object.keys(result)).toEqual(["output"]);
      const output = parseWavBytes(toBytes(result.output.data));
      expect(output?.sampleRate).toBe(24000);
      expect(output?.numChannels).toBe(1);
      expect(output?.samples.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        expect(output?.samples[i]).toBeCloseTo(input!.samples[i] / 2, 4);
      }
      expect(output?.samples).not.toEqual(input?.samples);
      if (form !== "inline" && form !== "storage") {
        expect(resolver).toHaveBeenCalled();
      }
    }
  );

  it("resolves an owned exact twelve-character resource prefix", async () => {
    const result = await new GainNode_({
      audio: { type: "audio", asset_id: owned.id.slice(0, 12), uri: "" },
      gain_db: -6.020599913279624
    }).process(context);
    expect(parseWavBytes(toBytes(result.output.data))?.samples[0]).toBeCloseTo(
      0.0625,
      4
    );
  });

  it("refuses an ambiguous twelve-character resource prefix", async () => {
    const prefix = owned.id.slice(0, 12);
    await Asset.create<Asset>({
      id: `${prefix}${"f".repeat(20)}`,
      user_id: OWNER,
      name: "other.wav",
      content_type: "audio/wav"
    });
    await expect(
      new GainNode_({
        audio: { type: "audio", asset_id: prefix, uri: "" },
        gain_db: -6
      }).process(context)
    ).rejects.toThrow("matches more than one row");
  });

  it("loads a concrete temporary storage URI without requiring an asset record", async () => {
    const uri = await context.storage!.store(
      "temporary/audio.wav",
      WAV,
      "audio/wav"
    );
    expect(await audioBytesAsync({ type: "audio", uri }, context)).toEqual(WAV);
  });

  it.each(["id", "asset URI"])(
    "rejects foreign %s audio despite readable storage bytes",
    async (form) => {
      const ref =
        form === "id"
          ? { type: "audio", asset_id: foreign.id, uri: "" }
          : { type: "audio", uri: `asset://${foreign.id}` };
      await expect(
        new GainNode_({ audio: ref, gain_db: -6 }).process(context)
      ).rejects.toThrow("Could not load audio");
    }
  );

  it("reports missing audio separately from missing assets", async () => {
    await expect(requireAudioBytes(null, context)).rejects.toThrow(
      "No audio connected"
    );
    await expect(
      requireAudioBytes(
        {
          type: "audio",
          asset_id: "00000000000000000000000000000000",
          uri: ""
        },
        context
      )
    ).rejects.toThrow("Could not load audio for asset");
  });

  it("preserves the external media policy for forbidden URL inputs", async () => {
    await expect(
      new GainNode_({
        audio: {
          type: "audio",
          uri: "http://169.254.169.254/latest/meta-data"
        },
        gain_db: -6
      }).process(context)
    ).rejects.toThrow("Could not load audio");
  });
});
