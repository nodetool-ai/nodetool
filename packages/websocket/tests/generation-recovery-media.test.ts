/**
 * Recovery of the response shapes the live fal provider supports has to save
 * their media. A shape the decoder treats as structured is marked ready with
 * no download and no asset, which completes a paid generation with nothing
 * saved — so these run the real host finalizer, not a stub.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ASSET_FOLDER = mkdtempSync(join(tmpdir(), "nt-recovery-test-"));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  GenerationAttempt,
  Prediction,
  initTestDb
} from "@nodetool-ai/models";

const fetchExternalMedia = vi.fn();
const storeAssetWithThumbnail = vi.fn();

vi.mock("@nodetool-ai/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/runtime")>()),
  fetchExternalMedia: (...args: unknown[]) => fetchExternalMedia(...args)
}));
vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: (...args: unknown[]) =>
    storeAssetWithThumbnail(...args)
}));

const { createGenerationRecoveryWorker } =
  await import("../src/generation-recovery.js");

const MEDIA = new Uint8Array([1, 2, 3, 4]);

async function dueAttempt(id: string): Promise<GenerationAttempt> {
  const accepted = await Prediction.acceptGenerationWithAttempt({
    id,
    user_id: "u1",
    provider: "fal_ai",
    model: "fal-ai/minimax/speech-02-hd",
    idempotency_key: id,
    input_fingerprint: `${id}-fingerprint`,
    provider_account_ref: "user:u1:secret:FAL_API_KEY",
    endpoint: "fal-ai/minimax/speech-02-hd"
  });
  await accepted.attempt.update({
    submission_status: "submitted",
    provider_status: "queued",
    provider_request_id: `${id}-request`,
    endpoint: "fal-ai/minimax/speech-02-hd",
    provider_account_ref: "user:u1:secret:FAL_API_KEY",
    next_check_at: "2026-01-01T00:00:00.000Z"
  });
  return accepted.attempt;
}

function scriptedQueue(result: Record<string, unknown>): {
  bind: ReturnType<typeof vi.fn>;
  wait: ReturnType<typeof vi.fn>;
} {
  return {
    bind: vi.fn().mockResolvedValue({ bound: true }),
    wait: vi.fn().mockResolvedValue({ state: "succeeded", result })
  };
}

describe("durable recovery of fal media responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchExternalMedia.mockResolvedValue(
      new Response(MEDIA, { headers: { "content-type": "audio/mpeg" } })
    );
    storeAssetWithThumbnail.mockResolvedValue(undefined);
    initTestDb();
  });

  it.each([
    ["audio_url", "https://fal.media/speech.mp3"],
    ["video_url", "https://fal.media/clip.mp4"]
  ])("saves a flat %s result as an asset", async (key, url) => {
    const generationId = `gen-${key}`;
    await dueAttempt(generationId);
    const queue = scriptedQueue({ [key]: url });

    await createGenerationRecoveryWorker({
      provider: { queueFor: async () => queue as never },
      now: () => new Date("2026-01-01T00:01:00.000Z")
    }).runOnce();

    expect(fetchExternalMedia).toHaveBeenCalledWith(url, expect.any(Object));
    expect(storeAssetWithThumbnail).toHaveBeenCalledTimes(1);
    const generation = await Prediction.find(generationId);
    expect(generation?.status).toBe("completed");
    expect(generation?.output_status).toBe("ready");
    expect(generation?.asset_ids).toHaveLength(1);
    const asset = await Asset.find("u1", generation?.asset_ids?.[0] ?? "");
    expect(asset?.content_type).toBe("audio/mpeg");
  });

  it("still saves the nested envelope beside its structured fields", async () => {
    await dueAttempt("gen-envelope");
    const queue = scriptedQueue({
      audio: { url: "https://fal.media/nested.mp3" },
      duration: 3.5
    });

    await createGenerationRecoveryWorker({
      provider: { queueFor: async () => queue as never },
      now: () => new Date("2026-01-01T00:01:00.000Z")
    }).runOnce();

    expect(storeAssetWithThumbnail).toHaveBeenCalledTimes(1);
    const generation = await Prediction.find("gen-envelope");
    expect(generation?.status).toBe("completed");
    expect(generation?.asset_ids).toHaveLength(1);
  });
});
