import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { createFakeContext, stubGlobalFetch } from "../src/testing.js";
import { FakeProvider } from "../src/providers/fake-provider.js";

describe("createFakeContext", () => {
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
      const stub = (handle.context as unknown as { _fetch: typeof fetch })
        ._fetch;
      const r = await stub("http://example.invalid/x");
      expect(r.status).toBe(200);
      expect(await r.text()).toBe("");
      const j = await (await stub("http://example.invalid/api/x")).text();
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
  it("textToImage returns PNG-magic bytes", async () => {
    const p = new FakeProvider();
    const bytes = await p.textToImage({
      prompt: "hello",
      model: { id: "x", name: "x", provider: "fake" }
    });
    expect(bytes[0]).toBe(0x89);
    expect(String.fromCharCode(bytes[1], bytes[2], bytes[3])).toBe("PNG");
  });

  it("textToVideo returns an ftyp-prefixed MP4 box", async () => {
    const p = new FakeProvider();
    const bytes = await p.textToVideo({
      prompt: "x",
      model: { id: "v", name: "v", provider: "fake" }
    });
    expect(String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])).toBe(
      "ftyp"
    );
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
});
