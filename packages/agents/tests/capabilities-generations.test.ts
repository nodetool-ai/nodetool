/**
 * The `generations` capability module and `background: true` on the media
 * capabilities (docs/media-generation-tracking-design.md § 10): every read is
 * the caller's own rows, a background call returns the id at once and the
 * row settles without anyone awaiting, cancel stops the call, and reconcile
 * asks the provider now.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Prediction, initTestDb } from "@nodetool-ai/models";
import {
  BaseProvider,
  ProcessingContext,
  generationRegistry,
  registerCostReconciler,
  type Message,
  type ProviderStreamItem,
  type TextToImageParams
} from "@nodetool-ai/runtime";
import { attachRunCostLedger } from "@nodetool-ai/execution";
import { ungatedCapabilityRun } from "../src/capabilities/invoke.js";
import { module as generations } from "../src/capabilities/generations.js";
import { module as media } from "../src/capabilities/media.js";
import type { CapabilityExport } from "../src/capabilities/types.js";

const USER = "u1";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function capability(
  mod: { exports: readonly CapabilityExport[] },
  name: string
): CapabilityExport {
  const found = mod.exports.find((c) => c.spec.name === name);
  if (!found) throw new Error(`no capability ${name}`);
  return found;
}

const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);

class SlowImageProvider extends BaseProvider {
  constructor(private readonly delayMs: number) {
    super("fake");
  }
  private async pause(signal: AbortSignal | undefined): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error("aborted"));
      });
    });
  }
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    await this.pause(params.signal);
    return PNG;
  }
  override async imageToImage(): Promise<Uint8Array> {
    await this.pause(undefined);
    return PNG;
  }
  override async textToVideo(): Promise<Uint8Array> {
    await this.pause(undefined);
    return MP4;
  }
  override async imageToVideo(): Promise<Uint8Array> {
    await this.pause(undefined);
    return MP4;
  }
  override async textToMusic(): Promise<{ data: Uint8Array; mimeType: string }> {
    await this.pause(undefined);
    return { data: MP3, mimeType: "audio/mpeg" };
  }
  override async textToSpeechEncoded(): Promise<{ data: Uint8Array; mimeType: string }> {
    await this.pause(undefined);
    return { data: MP3, mimeType: "audio/mpeg" };
  }
  async generateMessage(): Promise<Message> {
    throw new Error("not used");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("not used");
  }
}

function contextWithAssets(delayMs = 5): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "job-1", userId: USER });
  ctx.registerProvider("fake", new SlowImageProvider(delayMs));
  let n = 0;
  ctx.setModelInterfaces({
    createAsset: async (args) => ({ id: `asset-${++n}`, content_type: args.contentType })
  });
  attachRunCostLedger(ctx, { userId: USER, workflowId: null });
  return ctx;
}

async function settled(): Promise<void> {
  await new Promise((r) => setTimeout(r, 60));
}

describe("generations capabilities", () => {
  beforeEach(() => {
    initTestDb();
    generationRegistry.reset();
  });

  it("lists and reads only the caller's generations", async () => {
    await Prediction.create<Prediction>({ id: "mine", user_id: USER, provider: "fal", model: "m", capability: "text_to_image", status: "completed", cost: 0.1, asset_ids: ["a1"], created_at: new Date().toISOString() });
    await Prediction.create<Prediction>({ id: "theirs", user_id: "u2", provider: "fal", model: "m", status: "completed", cost: 0.1, created_at: new Date().toISOString() });
    const run = ungatedCapabilityRun(new ProcessingContext({ jobId: "j", userId: USER }));

    const listed = (await capability(generations, "list_generations").impl(run, {})) as {
      generations: Array<{ generation_id: string; asset_uris: string[] }>;
    };
    expect(listed.generations.map((g) => g.generation_id)).toEqual(["mine"]);
    expect(listed.generations[0].asset_uris).toEqual(["asset://a1"]);

    const got = (await capability(generations, "get_generation").impl(run, { generation_id: "mine" })) as { generation_id: string; cost: number };
    expect(got.generation_id).toBe("mine");
    expect(got.cost).toBe(0.1);
    const foreign = await capability(generations, "get_generation").impl(run, { generation_id: "theirs" });
    expect(foreign).toEqual({ error: "Generation theirs was not found." });
  });

  it("generate_image with background returns the id at once and the row settles on its own", async () => {
    const ctx = contextWithAssets(10);
    const run = ungatedCapabilityRun(ctx);
    const started = (await capability(media, "generate_image").impl(run, {
      provider: "fake",
      model: "m",
      prompt: "a fox",
      background: true
    })) as { generation_id: string; status: string; background: boolean };
    expect(started.status).toBe("running");
    expect(started.background).toBe(true);
    expect(generationRegistry.isRunning(started.generation_id)).toBe(true);

    const awaited = (await capability(generations, "await_generation").impl(run, {
      generation_id: started.generation_id,
      timeout_seconds: 5
    })) as { status: string; asset_ids: string[]; cost: number | null };
    expect(awaited.status).toBe("completed");
    expect(awaited.asset_ids).toEqual(["asset-1"]);
  });

  it("generate_image without background returns the asset and the generation id", async () => {
    const ctx = contextWithAssets(1);
    const run = ungatedCapabilityRun(ctx);
    const result = (await capability(media, "generate_image").impl(run, {
      provider: "fake",
      model: "m",
      prompt: "a fox"
    })) as { generation_id: string; asset_id: string; asset_uri: string; mime_type: string };
    expect(result.asset_id).toBe("asset-1");
    expect(result.asset_uri).toBe("asset://asset-1.png");
    expect(result.mime_type).toBe("image/png");
    await settled();
    const row = await Prediction.find(result.generation_id);
    expect(row?.status).toBe("completed");
    expect(row?.asset_ids).toEqual(["asset-1"]);
    expect(row?.surface).toBe("capability");
  });

  it("cancel_generation aborts a running call and refuses a foreign one", async () => {
    const ctx = contextWithAssets(5_000);
    const run = ungatedCapabilityRun(ctx);
    const started = (await capability(media, "generate_image").impl(run, {
      provider: "fake",
      model: "m",
      prompt: "slow",
      background: true
    })) as { generation_id: string };
    await settled();
    const other = ungatedCapabilityRun(new ProcessingContext({ jobId: "j", userId: "u2" }));
    const refused = (await capability(generations, "cancel_generation").impl(other, { generation_id: started.generation_id })) as { cancelled?: boolean };
    expect(refused.cancelled).toBe(false);
    const cancelled = (await capability(generations, "cancel_generation").impl(run, { generation_id: started.generation_id })) as { status: string; aborted: boolean };
    expect(cancelled).toMatchObject({ status: "cancelled", aborted: true });
    await settled();
    expect((await Prediction.find(started.generation_id))?.status).toBe("cancelled");
  });

  it("cancel_generation closes a row whose call runs elsewhere", async () => {
    await Prediction.create<Prediction>({ id: "remote", user_id: USER, status: "running", cost: null, created_at: new Date().toISOString() });
    const run = ungatedCapabilityRun(new ProcessingContext({ jobId: "j", userId: USER }));
    const result = (await capability(generations, "cancel_generation").impl(run, { generation_id: "remote" })) as { status: string; aborted: boolean };
    expect(result).toMatchObject({ status: "cancelled", aborted: false });
    expect((await Prediction.find("remote"))?.status).toBe("cancelled");
  });

  it("reconcile_generation asks the provider now", async () => {
    registerCostReconciler("acme", async () => ({ cost: 2.5, currency: "USD" }));
    await Prediction.create<Prediction>({ id: "r1", user_id: USER, provider: "acme", model: "m", status: "completed", cost: 1, provider_request_id: "req", created_at: new Date().toISOString() });
    const run = ungatedCapabilityRun(new ProcessingContext({ jobId: "j", userId: USER }));
    const result = await capability(generations, "reconcile_generation").impl(run, { generation_id: "r1" });
    expect(result).toMatchObject({ generation_id: "r1", before: 1, after: 2.5, reconciled: true });
  });

  it("every generation capability returns a generation id and accepts background", async () => {
    const ctx = contextWithAssets(1);
    ctx.setModelInterfaces({
      createAsset: async (args) => ({ id: `asset-${args.contentType.split("/")[0]}`, content_type: args.contentType })
    });
    Object.assign(ctx, {
      resolveAssetBytes: async () => ({ bytes: PNG, contentType: "image/png" })
    });
    const run = ungatedCapabilityRun(ctx);
    const base = { provider: "fake", model: "m" };
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["edit_image", { ...base, prompt: "bluer", input_file: "asset://seed.png" }, "image"],
      ["generate_video", { ...base, prompt: "a fox running" }, "video"],
      ["animate_image", { ...base, input_file: "asset://seed.png" }, "video"],
      ["generate_music", { ...base, prompt: "calm piano" }, "audio"],
      ["generate_speech", { ...base, text: "hello there" }, "audio"]
    ];
    for (const [name, params, type] of cases) {
      const sync = (await capability(media, name).impl(run, params)) as {
        type: string;
        generation_id?: string;
        asset_id?: string;
        error?: string;
      };
      expect(sync.error, name).toBeUndefined();
      expect(sync.type, name).toBe(type);
      expect(sync.generation_id, name).toBeTruthy();
      expect(sync.asset_id, name).toBe(`asset-${type}`);

      const bg = (await capability(media, name).impl(run, { ...params, background: true })) as {
        status: string;
        generation_id: string;
        background: boolean;
      };
      expect(bg.status, name).toBe("running");
      expect(bg.background, name).toBe(true);
      const awaited = (await capability(generations, "await_generation").impl(run, {
        generation_id: bg.generation_id,
        timeout_seconds: 5
      })) as { status: string; asset_ids: string[] };
      expect(awaited.status, name).toBe("completed");
      expect(awaited.asset_ids, name).toEqual([`asset-${type}`]);
    }
  });

  it("caps open background generations per run", async () => {
    const ctx = contextWithAssets(2_000);
    const run = ungatedCapabilityRun(ctx);
    const gen = capability(media, "generate_image");
    for (let i = 0; i < 16; i++) {
      await gen.impl(run, { provider: "fake", model: "m", prompt: `p${i}`, background: true });
    }
    const refused = (await gen.impl(run, { provider: "fake", model: "m", prompt: "one more", background: true })) as { error?: string };
    expect(refused.error).toContain("16 background generations");
    for (const id of generationRegistry.runningFor(USER)) generationRegistry.cancel(id, USER);
  });
});
