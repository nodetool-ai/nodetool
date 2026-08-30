/**
 * Failure and edge behaviour of DirectInferenceHandler: the abort seam
 * (register/deregister on every exit path), the supersede check on the
 * streamed inference path, the credit reservation lifecycle on the managed
 * provider, and the guard clauses of the direct text / media / transcription
 * paths. All dependencies are injected — no module mocking, no network.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must be set before anything calls getAssetAdapter(): the adapter is module
// state, created once from ASSET_FOLDER on first use.
process.env.ASSET_FOLDER = mkdtempSync(join(tmpdir(), "nt-inference-test-"));

import { describe, it, expect, beforeEach } from "vitest";
import { closeDb, initTestDb, Asset, Prediction } from "@nodetool-ai/models";
import type { BaseProvider } from "@nodetool-ai/runtime";

import {
  DirectInferenceHandler,
  entityRefResolver,
  estimateDirectTextSpend,
  resolveEntityReferenceImages,
  retrieveSourceAssetBytes,
  type DirectInferenceDeps,
  type DirectMediaGenerationRequest
} from "../src/session/inference.js";
import { releaseSpend, reserveSpend, reservedSpendUsd } from "../src/credit-gate.js";
import { getAssetFileName, retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { getAssetAdapter } from "../src/lib/storage.js";
import { storeAssetWithThumbnail } from "../src/lib/thumbnail.js";
import { FakeClientSession } from "./fake-client-session.js";

// A valid 1x1 PNG so the bytes store and the sharp thumbnail path both work.
const PNG_1x1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  218, 99, 100, 248, 207, 0, 0, 0, 3, 1, 1, 0, 24, 221, 141, 180, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130
]);

/**
 * SAFETY: each test's double implements exactly the provider methods the
 * handler path under test calls; BaseProvider's full surface is out of scope
 * for a recording double.
 */
const asProvider = (impl: object): BaseProvider => impl as unknown as BaseProvider;

interface AbortSeam {
  registered: AbortController[];
  deregistrations: number;
}

function makeDeps(seq: { value: number } = { value: 1 }): {
  deps: DirectInferenceDeps;
  seam: AbortSeam;
  seq: { value: number };
} {
  const seam: AbortSeam = { registered: [], deregistrations: 0 };
  const deps: DirectInferenceDeps = {
    defaults: { provider: "default-provider", model: "default-model" },
    currentRequestSeq: () => seq.value,
    registerAbort: (controller) => {
      seam.registered.push(controller);
      return () => {
        seam.deregistrations += 1;
      };
    }
  };
  return { deps, seam, seq };
}

function makeHandler(
  provider: BaseProvider | null,
  options: {
    userId?: string;
    seq?: { value: number };
    onResolve?: (providerId: string, userId: string) => void;
  } = {}
): { handler: DirectInferenceHandler; session: FakeClientSession; seam: AbortSeam; seq: { value: number } } {
  const session = new FakeClientSession({
    userId: options.userId ?? "1",
    resolveProvider: provider
      ? async (providerId, userId) => {
          options.onResolve?.(providerId, userId);
          return provider;
        }
      : undefined
  });
  const { deps, seam, seq } = makeDeps(options.seq);
  return { handler: new DirectInferenceHandler(session, deps), session, seam, seq };
}

async function createStoredAsset(
  userId: string,
  contentType: string,
  bytes: Uint8Array | null
): Promise<string> {
  const asset = new Asset({
    user_id: userId,
    workflow_id: null,
    name: "source",
    content_type: contentType,
    parent_id: null
  });
  if (bytes) {
    await storeAssetWithThumbnail(
      userId,
      asset.id,
      getAssetFileName(asset.id, contentType),
      bytes,
      contentType
    );
    asset.size = bytes.length;
  }
  await asset.save();
  return asset.id;
}

const imageRef = (uri: string) => ({
  uri,
  kind: "image" as const,
  mime: "image/png",
  index: 0,
  length: uri.length
});

describe("estimateDirectTextSpend boundaries", () => {
  it("honors an explicit zero output budget instead of substituting the default", () => {
    const zeroBudget = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: [{ content: "x".repeat(3000) }],
      maxTokens: 0
    });
    const defaultBudget = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: [{ content: "x".repeat(3000) }]
    });
    expect(zeroBudget).toBeGreaterThan(0);
    expect(zeroBudget).toBeLessThan(defaultBudget);
  });

  it("prices an empty message list on the output budget alone", () => {
    const usd = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: []
    });
    expect(usd).toBeGreaterThan(0);
  });
});

describe("handleInference", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("reports a missing provider resolver as an error frame", async () => {
    const { handler, session } = makeHandler(null);
    await handler.handleInference({}, 1);
    expect(session.messages).toEqual([
      { type: "error", message: "No provider resolver configured" }
    ]);
  });

  it("stamps seq onto chunks, forwards tool calls, and closes with inference_done", async () => {
    let received: Record<string, unknown> | null = null;
    const provider = asProvider({
      async *generateMessagesTraced(args: Record<string, unknown>) {
        received = args;
        yield { type: "chunk", content: "he" };
        yield { id: "t1", name: "search", args: { q: "x" } };
        yield { type: "chunk", content: "llo" };
      }
    });
    const resolved: string[] = [];
    const { handler, session } = makeHandler(provider, {
      seq: { value: 7 },
      onResolve: (providerId, userId) => resolved.push(providerId, userId)
    });
    await handler.handleInference(
      {
        provider: "openai",
        model: "gpt-test",
        messages: [
          { role: "user", content: "hi" },
          { role: 42, content: 42 }
        ],
        tools: [{ name: "search" }, { name: "" }, {}]
      },
      7
    );

    expect(resolved).toEqual(["openai", "1"]);
    expect(session.messages).toEqual([
      { type: "chunk", content: "he", seq: 7 },
      { type: "tool_call", id: "t1", name: "search", args: { q: "x" }, seq: 7 },
      { type: "chunk", content: "llo", seq: 7 },
      { type: "inference_done", seq: 7 }
    ]);
    const args = received as unknown as Record<string, unknown>;
    expect(args.model).toBe("gpt-test");
    // Nameless tools are dropped before the provider sees them.
    expect(args.tools).toEqual([
      { name: "search", description: undefined, inputSchema: undefined }
    ]);
    const messages = args.messages as Array<Record<string, unknown>>;
    // Non-string role and content are normalized, not forwarded raw.
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("");
  });

  it("falls back to the deps defaults and passes no tools for an empty list", async () => {
    let received: Record<string, unknown> | null = null;
    const provider = asProvider({
      async *generateMessagesTraced(args: Record<string, unknown>) {
        received = args;
      }
    });
    const resolved: string[] = [];
    const { handler } = makeHandler(provider, {
      onResolve: (providerId) => resolved.push(providerId)
    });
    await handler.handleInference({ tools: [] }, 1);
    expect(resolved).toEqual(["default-provider"]);
    expect((received as unknown as Record<string, unknown>).model).toBe(
      "default-model"
    );
    expect((received as unknown as Record<string, unknown>).tools).toBeUndefined();
  });

  it("discards the rest of the stream when a newer request supersedes it", async () => {
    const seq = { value: 5 };
    const provider = asProvider({
      async *generateMessagesTraced() {
        yield { type: "chunk", content: "first" };
        seq.value = 6; // a newer turn arrived mid-stream
        yield { type: "chunk", content: "stale" };
        yield { type: "chunk", content: "staler" };
      }
    });
    const { handler, session } = makeHandler(provider, { seq });
    await handler.handleInference({}, 5);

    // The first chunk made it out; nothing after the supersede did — and no
    // inference_done for a request that is no longer current.
    expect(session.messages).toEqual([
      { type: "chunk", content: "first", seq: 5 }
    ]);
  });
});

describe("runDirectTextGeneration", () => {
  beforeEach(() => {
    initTestDb();
  });

  const textReq = (overrides: Partial<Parameters<DirectInferenceHandler["runDirectTextGeneration"]>[0]> = {}) => ({
    provider: "anthropic",
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "write one word" }],
    schemaName: "result",
    schemaDescription: "the result",
    ...overrides
  });

  it("rejects a request with no resolver, no model, or no messages", async () => {
    const { handler: noResolver } = makeHandler(null);
    await expect(noResolver.runDirectTextGeneration(textReq())).rejects.toThrow(
      "No provider resolver configured"
    );

    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectTextGeneration(textReq({ model: "" }))
    ).rejects.toThrow("model is required");
    await expect(
      handler.runDirectTextGeneration(textReq({ messages: [] }))
    ).rejects.toThrow("prompt or messages is required");
  });

  it("registers an abort controller, hands its signal to the provider, and deregisters on success", async () => {
    let seenSignal: AbortSignal | undefined;
    const provider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced(args: { signal?: AbortSignal }) {
        seenSignal = args.signal;
        return { role: "assistant", content: "pong", toolCalls: null };
      }
    });
    const { handler, seam } = makeHandler(provider);
    const result = await handler.runDirectTextGeneration(textReq());
    expect(result).toEqual({ text: "pong", data: null });
    expect(seam.registered).toHaveLength(1);
    expect(seenSignal).toBe(seam.registered[0].signal);
    expect(seam.deregistrations).toBe(1);
  });

  it("deregisters the abort controller when the provider throws", async () => {
    const provider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced() {
        throw new Error("provider exploded");
      }
    });
    const { handler, seam } = makeHandler(provider);
    await expect(handler.runDirectTextGeneration(textReq())).rejects.toThrow(
      "provider exploded"
    );
    // Without this the host's abort set leaks a controller per failed call
    // for the life of the connection.
    expect(seam.deregistrations).toBe(1);
  });

  it("normalizes unknown roles to user before the provider call", async () => {
    let seenMessages: Array<Record<string, unknown>> = [];
    const provider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced(args: { messages: Array<Record<string, unknown>> }) {
        seenMessages = args.messages;
        return { role: "assistant", content: "ok", toolCalls: null };
      }
    });
    const { handler } = makeHandler(provider);
    await handler.runDirectTextGeneration(
      textReq({
        messages: [
          { role: "system", content: "s" },
          { role: "narrator", content: "n" }
        ]
      })
    );
    expect(seenMessages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("answers structured output from the forced tool's arguments, and deregisters", async () => {
    let seenTools: Array<Record<string, unknown>> = [];
    const provider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced(args: { tools: Array<Record<string, unknown>> }) {
        seenTools = args.tools;
        return {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "t1", name: "result", args: { ok: true } }]
        };
      }
    });
    const { handler, seam } = makeHandler(provider);
    const result = await handler.runDirectTextGeneration(
      textReq({ schema: { type: "object" } })
    );
    expect(result).toEqual({ text: "", data: { ok: true } });
    expect(seenTools).toEqual([
      { name: "result", description: "the result", inputSchema: { type: "object" } }
    ]);
    expect(seam.deregistrations).toBe(1);
  });

  it("refuses a managed call the credit gate denies, before any provider call", async () => {
    const userId = "cg-deny-text";
    reserveSpend(userId, "blocker", 1_000_000_000);
    try {
      let called = false;
      const provider = asProvider({
        getTotalCost: () => 0,
        async generateMessageTraced() {
          called = true;
          return { role: "assistant", content: "x", toolCalls: null };
        }
      });
      const { handler } = makeHandler(provider, { userId });
      await expect(
        handler.runDirectTextGeneration(
          textReq({ provider: "nodetool", model: "nodetool/director" })
        )
      ).rejects.toThrow(/credit/i);
      expect(called).toBe(false);
    } finally {
      releaseSpend(userId, "blocker");
    }
  });

  it("holds a reservation for the duration of a managed call and releases it after", async () => {
    const userId = "cg-hold-text";
    let reservedDuringCall = 0;
    const provider = asProvider({
      getTotalCost: () => 0.125,
      async generateMessageTraced() {
        reservedDuringCall = reservedSpendUsd(userId);
        return { role: "assistant", content: "done", toolCalls: null };
      }
    });
    const { handler } = makeHandler(provider, { userId });
    const result = await handler.runDirectTextGeneration(
      textReq({ provider: "nodetool", model: "nodetool/director" })
    );
    expect(result.text).toBe("done");
    // The estimate was held while the model ran…
    expect(reservedDuringCall).toBeGreaterThan(0);
    // …and released afterwards, so the next call admits against a clean slate.
    expect(reservedSpendUsd(userId)).toBe(0);

    // The real tracked cost — not the reservation — lands in the ledger.
    const [rows] = await Prediction.paginate(userId, { provider: "nodetool" });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBeCloseTo(0.125);
    expect(rows[0].node_type).toBe("direct.text");
  });

  it("releases the reservation when the managed call throws", async () => {
    const userId = "cg-throw-text";
    const provider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced() {
        throw new Error("model unavailable");
      }
    });
    const { handler } = makeHandler(provider, { userId });
    await expect(
      handler.runDirectTextGeneration(
        textReq({ provider: "nodetool", model: "nodetool/director" })
      )
    ).rejects.toThrow("model unavailable");
    expect(reservedSpendUsd(userId)).toBe(0);
  });

  it("still answers when the cost row cannot be persisted, logging the failure", async () => {
    const userId = "cg-persist-fail";
    const provider = asProvider({
      getTotalCost: () => 0.02,
      async generateMessageTraced() {
        // Sever the ledger between the model call and the cost row. The
        // sqlite half of closeDb is synchronous; beforeEach re-initializes.
        await closeDb();
        return { role: "assistant", content: "answered", toolCalls: null };
      }
    });
    const { handler, session } = makeHandler(provider, { userId });
    const result = await handler.runDirectTextGeneration(
      textReq({ provider: "nodetool", model: "nodetool/director" })
    );
    expect(result.text).toBe("answered");
    expect(session.errors).toHaveLength(1);
    expect(session.errors[0].context).toBe("direct text cost persistence failed");
    expect(reservedSpendUsd(userId)).toBe(0);
  });

  it("records a structured managed call as direct.structured, and no row at zero cost", async () => {
    const userId = "cg-structured";
    const provider = asProvider({
      getTotalCost: () => 0.05,
      async generateMessageTraced() {
        return {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "t1", name: "result", args: { n: 1 } }]
        };
      }
    });
    const { handler } = makeHandler(provider, { userId });
    await handler.runDirectTextGeneration(
      textReq({
        provider: "nodetool",
        model: "nodetool/director",
        schema: { type: "object" }
      })
    );
    const [rows] = await Prediction.paginate(userId, { provider: "nodetool" });
    expect(rows).toHaveLength(1);
    expect(rows[0].node_type).toBe("direct.structured");

    const freeUser = "cg-free";
    const freeProvider = asProvider({
      getTotalCost: () => 0,
      async generateMessageTraced() {
        return { role: "assistant", content: "gratis", toolCalls: null };
      }
    });
    const { handler: freeHandler } = makeHandler(freeProvider, { userId: freeUser });
    await freeHandler.runDirectTextGeneration(
      textReq({ provider: "nodetool", model: "nodetool/director" })
    );
    const [freeRows] = await Prediction.paginate(freeUser, { provider: "nodetool" });
    expect(freeRows).toHaveLength(0);
  });
});

describe("runDirectMediaGeneration", () => {
  beforeEach(() => {
    initTestDb();
  });

  const mediaReq = (
    overrides: Partial<DirectMediaGenerationRequest> = {}
  ): DirectMediaGenerationRequest => ({
    mode: "image",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    prompt: "a red fox",
    ...overrides
  });

  it("rejects a request with no resolver, no model, or a blank prompt", async () => {
    const { handler: noResolver } = makeHandler(null);
    await expect(noResolver.runDirectMediaGeneration(mediaReq())).rejects.toThrow(
      "No provider resolver configured"
    );
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectMediaGeneration(mediaReq({ model: "" }))
    ).rejects.toThrow("model is required");
    await expect(
      handler.runDirectMediaGeneration(mediaReq({ prompt: "   " }))
    ).rejects.toThrow("prompt is required");
  });

  it("clamps variations into [1, 8] before the provider call", async () => {
    const counts: number[] = [];
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToImages(_params: unknown, n: number) {
        counts.push(n);
        return Array.from({ length: n }, () => PNG_1x1);
      }
    });
    const { handler } = makeHandler(provider);
    const low = await handler.runDirectMediaGeneration(mediaReq({ variations: 0 }));
    const high = await handler.runDirectMediaGeneration(mediaReq({ variations: 99 }));
    const mid = await handler.runDirectMediaGeneration(mediaReq({ variations: 3 }));
    expect(counts).toEqual([1, 8, 3]);
    expect(low.asset_ids).toHaveLength(1);
    expect(high.asset_ids).toHaveLength(8);
    expect(mid.asset_ids).toHaveLength(3);
    const row = await Asset.find("1", mid.asset_ids[0]);
    expect(row?.content_type).toBe("image/png");
  });

  it("routes video without a source through textToVideo and with one through imageToVideo", async () => {
    const sourceId = await createStoredAsset("1", "image/png", PNG_1x1);
    const calls: string[] = [];
    let i2vInput: Uint8Array[] = [];
    const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToVideo(params: { durationSeconds: number | null }) {
        calls.push(`t2v:${params.durationSeconds}`);
        return mp4;
      },
      async imageToVideo(images: Uint8Array[]) {
        calls.push("i2v");
        i2vInput = images;
        return mp4;
      }
    });
    const { handler } = makeHandler(provider);

    const plain = await handler.runDirectMediaGeneration(
      mediaReq({ mode: "video", durationSeconds: 5 })
    );
    const fromImage = await handler.runDirectMediaGeneration(
      mediaReq({ mode: "video", sourceAssetId: sourceId })
    );
    expect(calls).toEqual(["t2v:5", "i2v"]);
    expect(i2vInput).toHaveLength(1);
    expect(Array.from(i2vInput[0])).toEqual(Array.from(PNG_1x1));
    for (const { asset_ids } of [plain, fromImage]) {
      const row = await Asset.find("1", asset_ids[0]);
      expect(row?.content_type).toBe("video/mp4");
    }
  });

  it("routes video_edit through videoToVideo with the request's parameters", async () => {
    const sourceId = await createStoredAsset("1", "video/mp4", new Uint8Array([9, 9]));
    let seen: { source: Uint8Array; params: Record<string, unknown> } | null = null;
    const provider = asProvider({
      getTotalCost: () => 0,
      async videoToVideo(source: Uint8Array, params: Record<string, unknown>) {
        seen = { source, params };
        return new Uint8Array([1]);
      }
    });
    const { handler } = makeHandler(provider);
    const { asset_ids } = await handler.runDirectMediaGeneration(
      mediaReq({
        mode: "video_edit",
        sourceAssetId: sourceId,
        strength: 0.6,
        durationSeconds: 4,
        resolution: "720p"
      })
    );
    const call = seen as unknown as { source: Uint8Array; params: Record<string, unknown> };
    expect(Array.from(call.source)).toEqual([9, 9]);
    expect(call.params.strength).toBe(0.6);
    expect(call.params.durationSeconds).toBe(4);
    expect(call.params.resolution).toBe("720p");
    const row = await Asset.find("1", asset_ids[0]);
    expect(row?.content_type).toBe("video/mp4");
  });

  it("routes an entity-mention prompt with a reference image through imageToImages", async () => {
    const entityAsset = new Asset({
      user_id: "1",
      workflow_id: null,
      name: "fox-entity",
      content_type: "image/png",
      parent_id: null
    });
    entityAsset.metadata = {
      nodetool_entity: { name: "Fox", descriptor: "a red fox with amber eyes" }
    };
    await storeAssetWithThumbnail(
      "1",
      entityAsset.id,
      getAssetFileName(entityAsset.id, "image/png"),
      PNG_1x1,
      "image/png"
    );
    await entityAsset.save();

    let seen: { images: Uint8Array[]; prompt: string } | null = null;
    const provider = asProvider({
      getTotalCost: () => 0,
      async imageToImages(
        images: Uint8Array[],
        params: { prompt: string },
        n: number
      ) {
        seen = { images, prompt: params.prompt };
        return Array.from({ length: n }, () => PNG_1x1);
      }
    });
    const { handler } = makeHandler(provider);
    await handler.runDirectMediaGeneration(
      mediaReq({ prompt: `portrait of entity://${entityAsset.id}` })
    );
    const call = seen as unknown as { images: Uint8Array[]; prompt: string };
    // The mention resolved to the entity's reference image…
    expect(call.images).toHaveLength(1);
    expect(Array.from(call.images[0])).toEqual(Array.from(PNG_1x1));
    // …and the prompt was seasoned: name inline, no dangling token.
    expect(call.prompt).toContain("Fox");
    expect(call.prompt).not.toContain("entity://");
  });

  it("requires a source for video_edit, and source+mask for inpaint", async () => {
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectMediaGeneration(mediaReq({ mode: "video_edit" }))
    ).rejects.toThrow("source_asset_id is required for video_edit");
    await expect(
      handler.runDirectMediaGeneration(mediaReq({ mode: "inpaint" }))
    ).rejects.toThrow("source_asset_id is required for inpaint");
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "inpaint", sourceAssetId: "src-1" })
      )
    ).rejects.toThrow("mask_asset_id is required for inpaint");
    await expect(
      handler.runDirectMediaGeneration(mediaReq({ mode: "image_edit" }))
    ).rejects.toThrow("source_asset_id is required for image_edit");
  });

  it("names the missing asset when an inpaint or edit source cannot be found", async () => {
    const sourceId = await createStoredAsset("1", "image/png", PNG_1x1);
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "inpaint", sourceAssetId: "nope", maskAssetId: sourceId })
      )
    ).rejects.toThrow("Source asset not found: nope");
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "inpaint", sourceAssetId: sourceId, maskAssetId: "nope" })
      )
    ).rejects.toThrow("Mask asset not found: nope");
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "image_edit", sourceAssetId: "nope" })
      )
    ).rejects.toThrow("Source asset not found: nope");
  });

  it("names the asset whose bytes are missing for inpaint and image_edit", async () => {
    const stored = await createStoredAsset("1", "image/png", PNG_1x1);
    const rowOnly = await createStoredAsset("1", "image/png", null);
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "inpaint", sourceAssetId: rowOnly, maskAssetId: stored })
      )
    ).rejects.toThrow(`Source asset bytes not found: ${rowOnly}`);
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "inpaint", sourceAssetId: stored, maskAssetId: rowOnly })
      )
    ).rejects.toThrow(`Mask asset bytes not found: ${rowOnly}`);
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ mode: "image_edit", sourceAssetId: rowOnly })
      )
    ).rejects.toThrow(`Source asset bytes not found: ${rowOnly}`);
  });

  it("hands inpaint the mask bytes and image_edit the source bytes", async () => {
    const sourceId = await createStoredAsset("1", "image/png", PNG_1x1);
    const mask = new Uint8Array(PNG_1x1);
    mask[mask.length - 1] = 0; // distinguishable from the source
    const maskId = await createStoredAsset("1", "image/png", mask);

    let inpaintMask: Uint8Array | null = null;
    let editSources: Uint8Array[] = [];
    const provider = asProvider({
      getTotalCost: () => 0,
      async inpaintImages(
        _images: Uint8Array[],
        params: { mask: Uint8Array },
        n: number
      ) {
        inpaintMask = params.mask;
        return Array.from({ length: n }, () => PNG_1x1);
      },
      async imageToImages(images: Uint8Array[], _params: unknown, n: number) {
        editSources = images;
        return Array.from({ length: n }, () => PNG_1x1);
      }
    });
    const { handler } = makeHandler(provider);
    await handler.runDirectMediaGeneration(
      mediaReq({ mode: "inpaint", sourceAssetId: sourceId, maskAssetId: maskId })
    );
    expect(Array.from(inpaintMask ?? [])).toEqual(Array.from(mask));

    await handler.runDirectMediaGeneration(
      mediaReq({ mode: "image_edit", sourceAssetId: sourceId })
    );
    expect(editSources).toHaveLength(1);
    expect(Array.from(editSources[0])).toEqual(Array.from(PNG_1x1));
  });

  it("stores provider-encoded audio under its own mime, defaulting an unknown one to .flac", async () => {
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToSpeechEncoded(args: { audioFormat?: string }) {
        // An unsupported requested format must arrive as undefined, not "xyz".
        expect(args.audioFormat).toBeUndefined();
        return { data: new Uint8Array([1, 2, 3]), mimeType: "audio/x-strange" };
      }
    });
    const { handler } = makeHandler(provider);
    const { asset_ids } = await handler.runDirectMediaGeneration(
      mediaReq({ mode: "audio", audioFormat: "xyz" })
    );
    const row = await Asset.find("1", asset_ids[0]);
    expect(row?.content_type).toBe("audio/x-strange");
    // The unknown-mime fallback stored the file with the flac extension.
    const adapter = getAssetAdapter();
    expect(
      await adapter.exists(adapter.uriForKey(`1/${asset_ids[0]}.flac`))
    ).toBe(true);
  });

  it("wraps the streaming-PCM fallback in a WAV container at the chunks' sample rate", async () => {
    const samples = new Int16Array([1000, -1000, 32767, -32768]);
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToSpeechEncoded() {
        return null;
      },
      async *textToSpeech() {
        yield { samples: samples.slice(0, 2) };
        yield { samples: samples.slice(2), sampleRate: 16000 };
        yield {}; // a chunk with no samples must be skipped, not crash
      }
    });
    const { handler } = makeHandler(provider);
    const { asset_ids } = await handler.runDirectMediaGeneration(
      mediaReq({ mode: "audio" })
    );
    const row = await Asset.find("1", asset_ids[0]);
    expect(row?.content_type).toBe("audio/wav");
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      "1",
      asset_ids[0],
      "audio/wav"
    );
    expect(bytes).not.toBeNull();
    const wav = bytes as Uint8Array;
    expect(wav.length).toBe(44 + samples.byteLength);
    const header = new TextDecoder().decode(wav.slice(0, 4));
    expect(header).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    const dv = new DataView(wav.buffer, wav.byteOffset);
    expect(dv.getUint32(24, true)).toBe(16000); // sample rate from the chunk
    expect(dv.getUint32(40, true)).toBe(samples.byteLength);
    const payload = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      payload[i] = dv.getInt16(44 + i * 2, true);
    }
    expect(Array.from(payload)).toEqual(Array.from(samples));
  });

  it("stores raw PCM without a WAV header when the caller asked for pcm", async () => {
    const samples = new Int16Array([5, 6, 7]);
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToSpeechEncoded() {
        return null;
      },
      async *textToSpeech() {
        yield { samples };
      }
    });
    const { handler } = makeHandler(provider);
    const { asset_ids } = await handler.runDirectMediaGeneration(
      mediaReq({ mode: "audio", audioFormat: "pcm" })
    );
    const row = await Asset.find("1", asset_ids[0]);
    expect(row?.content_type).toBe("audio/pcm");
    expect(row?.size).toBe(samples.byteLength);
  });

  it("holds and releases the managed reservation, and records max(tracked, estimate)", async () => {
    const userId = "cg-media";
    const provider = asProvider({
      getTotalCost: () => 0.5,
      async textToImages(_params: unknown, n: number) {
        return Array.from({ length: n }, () => PNG_1x1);
      }
    });
    const { handler } = makeHandler(provider, { userId });
    await handler.runDirectMediaGeneration(
      mediaReq({
        provider: "nodetool",
        model: "nodetool/unpriced-test-model",
        variations: 2
      })
    );
    expect(reservedSpendUsd(userId)).toBe(0);
    const [rows] = await Prediction.paginate(userId, { provider: "nodetool" });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBeCloseTo(0.5);
    expect(rows[0].node_type).toBe("direct.image");
    expect(rows[0].quantity).toBe(2);
    // cost = unit_price × quantity must reproduce the row's own total.
    expect(rows[0].unit_price).toBeCloseTo(0.25);
  });

  it("still answers a managed generation whose cost row cannot be persisted", async () => {
    const userId = "cg-media-persist-fail";
    const provider = asProvider({
      getTotalCost: (): number => {
        // Sever the ledger after the assets are stored but before the cost
        // row is written. The sqlite half of closeDb is synchronous.
        void closeDb();
        return 0.5;
      },
      async textToImages(_params: unknown, n: number) {
        return Array.from({ length: n }, () => PNG_1x1);
      }
    });
    const { handler, session } = makeHandler(provider, { userId });
    const { asset_ids } = await handler.runDirectMediaGeneration(
      mediaReq({ provider: "nodetool", model: "nodetool/unpriced-test-model" })
    );
    expect(asset_ids).toHaveLength(1);
    expect(session.errors).toHaveLength(1);
    expect(session.errors[0].context).toBe("direct media cost persistence failed");
    expect(reservedSpendUsd(userId)).toBe(0);
  });

  it("releases the managed reservation when the provider throws, and denies over budget", async () => {
    const userId = "cg-media-throw";
    const provider = asProvider({
      getTotalCost: () => 0,
      async textToImages() {
        throw new Error("render failed");
      }
    });
    const { handler } = makeHandler(provider, { userId });
    await expect(
      handler.runDirectMediaGeneration(
        mediaReq({ provider: "nodetool", model: "nodetool/unpriced-test-model" })
      )
    ).rejects.toThrow("render failed");
    expect(reservedSpendUsd(userId)).toBe(0);

    reserveSpend(userId, "blocker", 1_000_000_000);
    try {
      let called = false;
      const gated = asProvider({
        getTotalCost: () => 0,
        async textToImages() {
          called = true;
          return [PNG_1x1];
        }
      });
      const { handler: gatedHandler } = makeHandler(gated, { userId });
      await expect(
        gatedHandler.runDirectMediaGeneration(
          mediaReq({ provider: "nodetool", model: "nodetool/unpriced-test-model" })
        )
      ).rejects.toThrow(/credit/i);
      expect(called).toBe(false);
    } finally {
      releaseSpend(userId, "blocker");
    }
  });
});

describe("runDirectTranscription", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("rejects a request with no resolver, no model, or no asset id", async () => {
    const { handler: noResolver } = makeHandler(null);
    await expect(
      noResolver.runDirectTranscription({ provider: "openai", model: "m", assetId: "a" })
    ).rejects.toThrow("No provider resolver configured");
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectTranscription({ provider: "openai", model: "", assetId: "a" })
    ).rejects.toThrow("model is required");
    await expect(
      handler.runDirectTranscription({ provider: "openai", model: "m", assetId: "" })
    ).rejects.toThrow("asset_id is required");
  });

  it("distinguishes a missing asset row from missing bytes", async () => {
    const provider = asProvider({ getTotalCost: () => 0 });
    const { handler } = makeHandler(provider);
    await expect(
      handler.runDirectTranscription({ provider: "openai", model: "m", assetId: "ghost" })
    ).rejects.toThrow("Audio asset not found: ghost");

    // A row with no stored object behind it is the other failure.
    const rowOnly = await createStoredAsset("1", "audio/wav", null);
    await expect(
      handler.runDirectTranscription({ provider: "openai", model: "m", assetId: rowOnly })
    ).rejects.toThrow(`Audio asset bytes not found: ${rowOnly}`);
  });

  it("rounds word timings to ms and drops whitespace-only words", async () => {
    const assetId = await createStoredAsset("1", "audio/wav", new Uint8Array([1, 2]));
    const provider = asProvider({
      getTotalCost: () => 0,
      async automaticSpeechRecognition(args: { word_timestamps?: boolean }) {
        expect(args.word_timestamps).toBe(true);
        return {
          text: "hello world",
          chunks: [
            { text: " hello ", timestamp: [0.5004, 1.2346] },
            { text: "   ", timestamp: [1.3, 1.4] },
            { text: "world", timestamp: [1.5, 2] }
          ]
        };
      }
    });
    const { handler } = makeHandler(provider);
    const result = await handler.runDirectTranscription({
      provider: "openai",
      model: "whisper-test",
      assetId
    });
    expect(result.text).toBe("hello world");
    expect(result.words).toEqual([
      { word: "hello", startMs: 500, endMs: 1235 },
      { word: "world", startMs: 1500, endMs: 2000 }
    ]);
  });

  it("refuses a managed transcription the credit gate denies, before the asset lookup", async () => {
    const userId = "cg-deny-transcribe";
    reserveSpend(userId, "blocker", 1_000_000_000);
    try {
      const provider = asProvider({ getTotalCost: () => 0 });
      const { handler } = makeHandler(provider, { userId });
      await expect(
        handler.runDirectTranscription({
          provider: "nodetool",
          model: "whisper-test",
          assetId: "ghost"
        })
      ).rejects.toThrow(/credit/i);
    } finally {
      releaseSpend(userId, "blocker");
    }
  });

  it("still answers a transcription whose cost row cannot be persisted", async () => {
    const userId = "cg-transcribe-persist-fail";
    const assetId = await createStoredAsset(userId, "audio/wav", new Uint8Array([1]));
    const provider = asProvider({
      getTotalCost: () => 0.02,
      async automaticSpeechRecognition() {
        await closeDb();
        return { text: "spoken", chunks: [{ text: "spoken", timestamp: [0, 1] }] };
      }
    });
    const { handler, session } = makeHandler(provider, { userId });
    const result = await handler.runDirectTranscription({
      provider: "nodetool",
      model: "whisper-test",
      assetId
    });
    expect(result.text).toBe("spoken");
    expect(result.words).toEqual([{ word: "spoken", startMs: 0, endMs: 1000 }]);
    expect(session.errors).toHaveLength(1);
    expect(session.errors[0].context).toBe(
      "direct transcription cost persistence failed"
    );
  });

  it("answers no words when the provider returns none, and records managed spend", async () => {
    const userId = "cg-transcribe";
    const assetId = await createStoredAsset(userId, "audio/wav", new Uint8Array([1]));
    const provider = asProvider({
      getTotalCost: () => 0.01,
      async automaticSpeechRecognition() {
        return { text: "silence" };
      }
    });
    const { handler } = makeHandler(provider, { userId });
    const result = await handler.runDirectTranscription({
      provider: "nodetool",
      model: "whisper-test",
      assetId
    });
    expect(result.words).toEqual([]);
    const [rows] = await Prediction.paginate(userId, { provider: "nodetool" });
    expect(rows).toHaveLength(1);
    expect(rows[0].node_type).toBe("direct.transcription");
    expect(rows[0].cost).toBeCloseTo(0.01);
  });
});

describe("entity reference helpers", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("entityRefResolver answers null for a missing asset and the row's fields otherwise", async () => {
    const resolver = entityRefResolver("1");
    expect(await resolver.getAssetInfo("ghost")).toBeNull();
    const id = await createStoredAsset("1", "image/png", PNG_1x1);
    const info = await resolver.getAssetInfo(id);
    expect(info).toEqual({
      id,
      content_type: "image/png",
      name: "source",
      metadata: null
    });
  });

  it("resolveEntityReferenceImages drops unresolvable and empty refs, keeps real bytes", async () => {
    const goodId = await createStoredAsset("1", "image/png", PNG_1x1);
    const rowOnlyId = await createStoredAsset("1", "image/png", null);
    const emptyId = await createStoredAsset("1", "image/png", new Uint8Array());
    const out = await resolveEntityReferenceImages("1", [
      imageRef(`asset://${goodId}.png`),
      imageRef("asset://.png"), // empty id
      imageRef("asset://no-dot"), // no extension → mangled id → no asset
      imageRef("asset://ghost.png"), // no row
      imageRef(`asset://${rowOnlyId}.png`), // row, no bytes
      imageRef(`asset://${emptyId}.png`) // row, zero-length bytes
    ]);
    expect(out).toHaveLength(1);
    expect(Array.from(out[0])).toEqual(Array.from(PNG_1x1));
  });

  it("retrieveSourceAssetBytes names the asset in both failure modes", async () => {
    await expect(retrieveSourceAssetBytes("1", "ghost")).rejects.toThrow(
      "Source asset not found: ghost"
    );
    const rowOnly = await createStoredAsset("1", "image/png", null);
    await expect(retrieveSourceAssetBytes("1", rowOnly)).rejects.toThrow(
      `Source asset bytes not found: ${rowOnly}`
    );
  });
});
