import { describe, expect, it } from "vitest";
import { CopilotProvider } from "../../src/providers/copilot-provider.js";
import type { Message, ProviderStreamItem } from "../../src/providers/types.js";
import { collect, fakeAcp, text, tool } from "./fake-acp.js";

const user = (content: string): Message => ({ role: "user", content });
const models = { models: { availableModels: [{ modelId: "auto", name: "Auto" }] } };

describe("CopilotProvider", () => {
  it("needs no secrets, takes tools through generateLoop and denies the CLI's own tools at the CLI", async () => {
    const provider = new CopilotProvider({}, { spawnAcp: fakeAcp(async () => undefined).spawn });
    expect(CopilotProvider.requiredSecrets()).toEqual([]);
    expect(await provider.hasToolSupport()).toBe(true);
    const args = (provider as unknown as { acpArgs: string[] }).acpArgs;
    expect(args).toContain("--acp");
    expect(args).toContain("--disable-builtin-mcps");
    for (const kind of ["shell", "write", "read", "url", "memory"]) {
      expect(args).toContain(`--deny-tool=${kind}`);
    }
  });

  it("lists the account's models and reports availability", async () => {
    const cli = fakeAcp(async () => undefined, { newResult: models });
    const provider = new CopilotProvider({}, { spawnAcp: cli.spawn });
    expect(await provider.getAvailableLanguageModels()).toEqual([{ id: "auto", name: "Auto", provider: "copilot" }]);
    expect(await provider.unavailableReason()).toBeNull();

    const missing = new CopilotProvider({}, {
      spawnAcp: async () => { throw new Error("GitHub Copilot CLI (copilot) not found. Install it."); }
    });
    expect(await missing.getAvailableLanguageModels()).toEqual([]);
    expect(await missing.unavailableReason()).toContain("not found");
  });

  it("streams a plain turn with no tool server, ending in one done chunk", async () => {
    const cli = fakeAcp(async ({ mcp, update }) => {
      expect(mcp).toEqual([]);
      update(text("po"));
      update(text("ng"));
    });
    const provider = new CopilotProvider({}, { spawnAcp: cli.spawn });
    const items = await collect(provider.generateMessages({ model: "auto", messages: [{ role: "system", content: "Be terse." }, user("ping")] }));
    expect(items).toEqual([
      { type: "chunk", content: "po", done: false },
      { type: "chunk", content: "ng", done: false },
      { type: "chunk", content: "", done: true }
    ]);
    expect(cli.requests.some((r) => r.method === "session/set_model")).toBe(false);
    const prompt = cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text as string;
    expect(prompt).toContain("<instructions>\nBe terse.");
    expect(prompt).toContain("ping");
    expect((await provider.generateMessage({ model: "auto", messages: [user("ping")] })).content).toBe("pong");
  });

  it("selects a model other than auto", async () => {
    const cli = fakeAcp(async () => undefined);
    const provider = new CopilotProvider({}, { spawnAcp: cli.spawn });
    await collect(provider.generateMessages({ model: "gpt-x", messages: [user("hi")] }));
    expect(cli.requests.find((r) => r.method === "session/set_model")?.params).toEqual({ sessionId: "s1", modelId: "gpt-x" });
  });

  it("returns a forced single tool call as the structured result", async () => {
    const cli = fakeAcp(async ({ mcp }) => {
      const server = mcp[0];
      const token = String(server.headers[0].value).replace("Bearer ", "");
      const res = await fetch(server.url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "answer", arguments: { city: "Paris" } } })
      });
      expect((await res.json()).result.isError).toBe(false);
    });
    const provider = new CopilotProvider({}, { spawnAcp: cli.spawn });
    const items: ProviderStreamItem[] = await collect(
      provider.generateMessages({ model: "auto", messages: [user("capital of France?")], tools: [tool("answer")], toolChoice: "answer" })
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "answer", args: { city: "Paris" } });
    expect(items[1]).toEqual({ type: "chunk", content: "", done: true });
    const prompt = cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text as string;
    expect(prompt).toContain("calling the `answer` tool exactly once");
  });

  it("fails a forced tool the CLI never called", async () => {
    const provider = new CopilotProvider({}, { spawnAcp: fakeAcp(async () => undefined).spawn });
    await expect(
      collect(provider.generateMessages({ model: "auto", messages: [user("x")], tools: [tool("answer")], toolChoice: "answer" }))
    ).rejects.toThrow(/did not call the answer tool/);
  });

  it("runs the CLI's tool loop over HTTP MCP, approving only its own tools", async () => {
    const options = [{ optionId: "allow_once", kind: "allow_once" }, { optionId: "reject_once", kind: "reject_once" }];
    const cli = fakeAcp(async ({ mcp, update, ask }) => {
      update(text("Checking."));
      update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "nodetool-secret_word" });
      ask({ toolCall: { toolCallId: "c1", title: "secret_word", kind: "other" }, options });
      const server = mcp[0];
      expect(server.type).toBe("http");
      const token = String(server.headers[0].value).replace("Bearer ", "");
      await fetch(server.url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "secret_word", arguments: {} } })
      });
      update({ sessionUpdate: "tool_call", toolCallId: "c2", title: "echo pwned" });
      ask({ toolCall: { toolCallId: "c2", title: "echo pwned", kind: "execute" }, options });
      update(text("Done."));
    });
    const provider = new CopilotProvider({}, { spawnAcp: cli.spawn });
    const items = await collect(
      provider.generateLoop({
        model: "auto",
        messages: [user("what is the word")],
        tools: [tool("secret_word")],
        executeTool: async () => "PINEAPPLE42"
      })
    );
    const shapes = items.map((i) => ("type" in i && i.type === "message" ? `message:${i.message.role}` : "type" in i ? i.type : "toolcall"));
    expect(shapes).toEqual(["chunk", "toolcall", "message:assistant", "message:tool", "chunk", "message:assistant", "chunk"]);
    expect(items.find((i) => "type" in i && i.type === "message" && i.message.role === "tool")).toMatchObject({ message: { content: "PINEAPPLE42" } });
    expect(cli.permissionReplies).toEqual([
      { outcome: { outcome: "selected", optionId: "allow_once" } },
      { outcome: { outcome: "selected", optionId: "reject_once" } }
    ]);
  });

  it("refuses image input rather than dropping it", async () => {
    const provider = new CopilotProvider({}, { spawnAcp: fakeAcp(async () => undefined).spawn });
    await expect(
      collect(provider.generateMessages({
        model: "auto",
        messages: [{ role: "user", content: [{ type: "image_url", image: { uri: "asset://x" } } as never] }]
      }))
    ).rejects.toThrow(/GitHub Copilot CLI accepts text prompts only/);
  });
});
