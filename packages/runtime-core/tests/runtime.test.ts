import { describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunCancellation, OpenAITextProvider, safeFetch, createLocalWorkspace } from "../src/index.js";

describe("lean execution services", () => {
  it("scopes cancellation to the run owner and releases finished runs", () => {
    const runs = new RunCancellation();
    const signal = runs.start("run", "alice");
    expect(runs.cancel("run", "bob")).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(runs.cancel("run", "alice")).toBe(true);
    expect(signal.aborted).toBe(true);
    runs.finish("run", "alice");
    expect(runs.start("run", "alice").aborted).toBe(false);
    runs.close();
  });

  it("rejects unsafe redirect targets before transport sees them", async () => {
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    };
    await expect(safeFetch("https://example.com", undefined, 5, transport)).rejects.toThrow("unsafe URL");
    expect(calls).toBe(1);
  });

  it("strips Anthropic credentials across origins while retaining same-origin auth and cancellation", async () => {
    const controller = new AbortController();
    const requests: RequestInit[] = [];
    const transport: typeof fetch = async (_input, init) => {
      requests.push(init ?? {});
      if (requests.length === 1) {
        return new Response(null, { status: 307, headers: { location: "/same-origin" } });
      }
      if (requests.length === 2) {
        return new Response(null, { status: 307, headers: { location: "https://other.example/result" } });
      }
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      init?.signal?.throwIfAborted();
      throw new Error("Abort did not propagate");
    };
    await expect(safeFetch("https://api.anthropic.com/v1/messages", {
      method: "POST", body: "secret request", headers: { "X-API-Key": "tenant-secret", "proxy-authorization": "proxy-secret" }, signal: controller.signal
    }, 5, transport)).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toHaveLength(3);
    expect(new Headers(requests[1].headers).get("x-api-key")).toBe("tenant-secret");
    expect(requests[1].body).toBe("secret request");
    expect(new Headers(requests[2].headers).get("x-api-key")).toBeNull();
    expect(new Headers(requests[2].headers).get("proxy-authorization")).toBeNull();
    expect(requests[2].body).toBeUndefined();
  });

  it("streams text with exactly one terminal usage chunk for length termination", async () => {
    const transport: typeof fetch = async () => new Response([
      'data: {"id":"x","object":"chat.completion.chunk","created":0,"model":"fixture","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"x","object":"chat.completion.chunk","created":0,"model":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n',
      'data: {"id":"x","object":"chat.completion.chunk","created":0,"model":"fixture","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n'
    ].join(""), { headers: { "content-type": "text/event-stream" } });
    const provider = new OpenAITextProvider({ apiKey: "fixture", fetch: transport });
    const chunks = [];
    for await (const chunk of provider.stream({ model: "fixture", messages: [{ role: "user", content: "hello" }], signal: new AbortController().signal })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([{ done: false, text: "hello" }, { done: true, usage: { inputTokens: 3, outputTokens: 2 } }]);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.stream({ model: "fixture", messages: [], signal: controller.signal })[Symbol.asyncIterator]().next()).rejects.toThrow();
  });

  it("stores opaque binary bytes and refuses traversal and symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "runtime-core-"));
    const outside = await mkdtemp(join(tmpdir(), "runtime-outside-"));
    try {
      const workspace = createLocalWorkspace(root);
      const bytes = new Uint8Array([0, 255, 17]);
      await workspace.write("asset.bin", bytes);
      expect(await workspace.read("asset.bin")).toEqual(bytes);
      expect(() => workspace.key("../outside")).toThrow();
      await symlink(outside, join(root, "escape"));
      await expect(workspace.write("escape/asset.bin", bytes)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
