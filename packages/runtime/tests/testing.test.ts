import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFakeContext, stubGlobalFetch } from "../src/testing.js";
import { FakeProvider } from "../src/providers/fake-provider.js";
import { verifyDecodes } from "../src/media/index.js";

describe("createFakeContext", () => {
  it("persists entities and storyboards within one fake host", async () => {
    const first = createFakeContext();
    const second = createFakeContext();
    try {
      const asset = await first.context.createAsset({
        name: "reference.png",
        contentType: "image/png",
        content: new Uint8Array([1])
      });
      if (!asset || typeof asset !== "object" || !("id" in asset) || typeof asset.id !== "string") {
        throw new Error("Fake asset missing its id");
      }
      const args = {
        kind: "character" as const,
        name: "Lead",
        descriptor: "A red coat",
        imageAssetId: asset.id,
        source: { key: "lead" }
      };
      const created = await first.context.upsertEntity(args);
      expect(created.created).toBe(true);
      expect(await first.context.getEntity(created.entity.id)).toEqual(
        created.entity
      );
      const updated = await first.context.upsertEntity({
        ...args,
        descriptor: "A blue coat"
      });
      expect(updated.created).toBe(false);
      expect(updated.entity.id).toBe(created.entity.id);
      expect(updated.entity.descriptor).toBe("A blue coat");
      expect(await second.context.getEntity(created.entity.id)).toBeNull();

      const board = await first.context.createStoryboard({
        name: "Cast board",
        projectId: "project",
        document: { shots: [] }
      });
      expect(
        await first.context.listStoryboards({ projectId: "project" })
      ).toEqual([board]);
      expect(
        await first.context.listStoryboards({ projectId: "other" })
      ).toEqual([]);
      expect(await first.context.getStoryboard(board.id)).toEqual(board);
      const saved = await first.context.updateStoryboard(board.id, {
        document: { shots: [{ id: "shot" }] },
        timelineId: "timeline"
      });
      expect(saved).toMatchObject({
        id: board.id,
        document: { shots: [{ id: "shot" }] },
        timelineId: "timeline"
      });
      expect(await first.context.getStoryboard(board.id)).toEqual(saved);
      expect(await second.context.getStoryboard(board.id)).toBeNull();
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it("returns a ProcessingContext with in-memory storage and a temp workspace", () => {
    const handle = createFakeContext();
    try {
      expect(handle.context.storage).toBeDefined();
      expect(handle.context.workspaceStorage).toBeDefined();
      expect(handle.context.workspaceDir).toBe(handle.workspaceDir);
      expect(fs.existsSync(handle.workspaceDir)).toBe(true);
    } finally {
      handle.cleanup();
      expect(fs.existsSync(handle.workspaceDir)).toBe(false);
    }
  });

  it("cleanup() leaves a caller-supplied workspace dir alone", () => {
    // Verifies the safety guard: only auto-created temp dirs get removed.
    // A caller passing their own directory must not have it rm-rf'd.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-own-ws-"));
    const sentinel = path.join(dir, "do-not-delete.txt");
    fs.writeFileSync(sentinel, "keep me", "utf8");
    const handle = createFakeContext({ workspaceDir: dir });
    try {
      expect(handle.workspaceDir).toBe(dir);
    } finally {
      handle.cleanup();
    }
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("keep me");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves any providerId to a FakeProvider and caches it", async () => {
    const handle = createFakeContext();
    try {
      const a = await handle.context.getProvider("openai");
      const b = await handle.context.getProvider("openai");
      const c = await handle.context.getProvider("anthropic");
      expect(a).toBeInstanceOf(FakeProvider);
      expect(a).toBe(b);
      expect(c).toBeInstanceOf(FakeProvider);
      expect(c).not.toBe(a);
      expect(handle.providers.has("openai")).toBe(true);
      expect(handle.providers.has("anthropic")).toBe(true);
    } finally {
      handle.cleanup();
    }
  });

  it("honors the providers override map", async () => {
    const custom = new FakeProvider({ textResponse: "custom" });
    const handle = createFakeContext({ providers: { openai: custom } });
    try {
      const resolved = await handle.context.getProvider("openai");
      expect(resolved).toBe(custom);
    } finally {
      handle.cleanup();
    }
  });

  it("fetch stub returns 200 with empty body by default", async () => {
    const handle = createFakeContext();
    try {
      // Exercise the stub through the public HTTP helper so the test
      // doesn't depend on ProcessingContext's private `_fetch` field.
      const r = await handle.context.httpGet("http://example.invalid/x");
      expect(r.status).toBe(200);
      expect(await r.text()).toBe("");
      const j = await (
        await handle.context.httpGet("http://example.invalid/api/x")
      ).text();
      expect(j).toBe("{}");
    } finally {
      handle.cleanup();
    }
  });

  it("secret resolver defaults to empty so credential-checking nodes fail fast", async () => {
    const handle = createFakeContext();
    try {
      const secret = await handle.context.getSecret("OPENAI_API_KEY");
      expect(secret).toBe("");
    } finally {
      handle.cleanup();
    }
  });

  it("secret resolver override takes precedence over the empty default", async () => {
    const handle = createFakeContext({
      secretResolver: (key) => (key === "FOO_API_KEY" ? "override" : null)
    });
    try {
      expect(await handle.context.getSecret("FOO_API_KEY")).toBe("override");
      expect(await handle.context.getSecret("OTHER_KEY")).toBe("");
    } finally {
      handle.cleanup();
    }
  });
});

describe("fake document and entity persistence", () => {
  it("retains boards for reuse and entities keyed by their source without sharing contexts", async () => {
    const fake = createFakeContext();
    const isolated = createFakeContext();
    try {
      const document = { shots: [], templateId: "template", recastKey: "batch" };
      const board = await fake.context.createStoryboard({ name: "Board", projectId: "project", document });
      expect(board.id).toMatch(/^[0-9a-f]{32}$/);
      expect(await fake.context.getStoryboard(board.id)).toMatchObject({ id: board.id, document });
      expect(await fake.context.listStoryboards({ projectId: "project" })).toHaveLength(1);
      expect(await fake.context.findRecastStoryboard({ projectId: "project", templateId: "template", recastKey: "batch" })).toMatchObject({ id: board.id });
      expect(await isolated.context.listStoryboards()).toEqual([]);
      const asset = await fake.context.createAsset({ name: "image.png", contentType: "image/png", content: new Uint8Array([1]) });
      if (!asset || typeof asset !== "object" || !("id" in asset) || typeof asset.id !== "string") { throw new Error("Fake asset missing its id"); }
      const args = { kind: "character" as const, name: "Lead", descriptor: "Original", imageAssetId: asset.id, source: { key: "lead" } };
      const first = await fake.context.upsertEntity(args);
      const second = await fake.context.upsertEntity({ ...args, name: "Renamed", descriptor: "Updated" });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.entity.id).toBe(first.entity.id);
      expect((await fake.context.listEntities())[0]?.descriptor).toBe("Updated");
      expect(await isolated.context.getEntity(first.entity.id)).toBeNull();
      await expect(fake.context.upsertEntity({ ...args, imageAssetId: "missing" })).rejects.toThrow();
    } finally { fake.cleanup(); isolated.cleanup(); }
  });
});

describe("stubGlobalFetch", () => {
  it("replaces global fetch and restore() puts the original back", async () => {
    const original = globalThis.fetch;
    const restore = stubGlobalFetch();
    try {
      expect(globalThis.fetch).not.toBe(original);
      const r = await globalThis.fetch("http://nope.invalid/something");
      expect(r.status).toBe(200);
    } finally {
      restore();
    }
    expect(globalThis.fetch).toBe(original);
  });

  it("honors a custom responder", async () => {
    const restore = stubGlobalFetch((url) =>
      new Response(`hit ${url}`, { status: 418 })
    );
    try {
      const r = await globalThis.fetch("http://nope.invalid/x");
      expect(r.status).toBe(418);
      expect(await r.text()).toBe("hit http://nope.invalid/x");
    } finally {
      restore();
    }
  });
});

describe("FakeProvider media capabilities", () => {
  it("lists explicit image and video test models with matching capabilities", async () => {
    const provider = new FakeProvider({ includeLanguageModels: false });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    expect(await provider.getAvailableImageModels()).toEqual([expect.objectContaining({ id: "fake-image", provider: "fake" })]);
    expect(await provider.getAvailableVideoModels()).toEqual([expect.objectContaining({ id: "fake-video", provider: "fake" })]);
    expect(provider.getCapabilities()).toEqual(expect.arrayContaining([
      "text_to_image", "image_to_image", "text_to_video", "image_to_video", "reference_to_video"
    ]));
    expect(await new FakeProvider().getAvailableLanguageModels()).not.toEqual([]);
  });

  it("textToImage returns a fully decodable PNG", async () => {
    const p = new FakeProvider();
    const bytes = await p.textToImage({
      prompt: "hello",
      model: { id: "x", name: "x", provider: "fake" }
    });
    expect(bytes[0]).toBe(0x89);
    expect(String.fromCharCode(bytes[1], bytes[2], bytes[3])).toBe("PNG");
    await verifyDecodes(bytes, { kind: "video", format: "png_pipe" });
  });

  it("textToVideo returns a fully decodable MP4", async () => {
    const p = new FakeProvider();
    const bytes = await p.textToVideo({
      prompt: "x",
      model: { id: "v", name: "v", provider: "fake" }
    });
    expect(String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])).toBe(
      "ftyp"
    );
    // Every stream of the clip decodes, with strict error detection.
    await verifyDecodes(bytes, { kind: "video" });
    await verifyDecodes(bytes, { kind: "audio" });
  });

  it("textToSpeechEncoded returns a parseable WAV", async () => {
    const p = new FakeProvider();
    const result = await p.textToSpeechEncoded({ text: "hi", model: "x" });
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("audio/wav");
    expect(String.fromCharCode(...result!.data.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...result!.data.slice(8, 12))).toBe("WAVE");
  });

  it("automaticSpeechRecognition returns a stub transcript", async () => {
    const p = new FakeProvider();
    const result = await p.automaticSpeechRecognition({
      audio: new Uint8Array(0),
      model: "whisper-1"
    });
    expect(result.text).toBe("fake transcript");
  });

  it("generateEmbedding returns N vectors of the requested dimension", async () => {
    const p = new FakeProvider();
    const result = await p.generateEmbedding({
      text: ["a", "bb", "ccc"],
      model: "embed-1",
      dimensions: 4
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(4);
  });

  it("tool burst is shared across generateMessage and generateMessages", async () => {
    const p = new FakeProvider({ toolCallsPerTool: 2 });
    const tools = [{ name: "add_item" }];

    const first = await p.generateMessage({
      messages: [],
      model: "x",
      tools
    });
    expect(first.toolCalls).toHaveLength(2);

    // Second invocation — via the streaming API — must NOT emit another
    // burst because the counter is shared.
    const items: unknown[] = [];
    for await (const item of p.generateMessages({
      messages: [],
      model: "x",
      tools
    })) {
      items.push(item);
    }
    // Only the default text chunk should arrive (no tool calls).
    expect(items.every((i) => (i as { type?: string }).type === "chunk")).toBe(
      true
    );
  });
});
