import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACP_BRIDGE_SOURCE,
  listAcpModels,
  permissionOutcome,
  runAcpTurn,
  type AcpEvent
} from "../../src/providers/acp-session.js";
import { generateImageViaAcp } from "../../src/providers/antigravity-image.js";
import { AntigravityProvider } from "../../src/providers/antigravity-provider.js";
import type { Message, ProviderStreamItem } from "../../src/providers/types.js";
import { bridgeCall, collect, fakeAcp, text, tool, type Env } from "./fake-acp.js";

describe("runAcpTurn", () => {
  it("serves the tools, runs the CLI's call on the host and streams text around it", async () => {
    const calls: string[] = [];
    const cli = fakeAcp(async ({ env, update }) => {
      update(text("Let me check. "));
      const listed = await bridgeCall(env, "/tools", {});
      expect(listed.body.tools.map((t: { name: string }) => t.name)).toEqual(["secret_word"]);
      const called = await bridgeCall(env, "/call", { name: "secret_word", arguments: { n: 1 } });
      expect(called.body).toEqual({ isError: false, content: [{ type: "text", text: "PINEAPPLE" }] });
      update(text("It was PINEAPPLE."));
    });

    const events: AcpEvent[] = await collect(
      runAcpTurn({
        spawn: cli.spawn,
        cwd: "/tmp",
        model: "gemini-3.8-flash-low",
        prompt: "go",
        tools: [tool("secret_word")],
        executeTool: async (_id, name, args) => {
          calls.push(`${name}:${JSON.stringify(args)}`);
          return { text: "PINEAPPLE", isError: false };
        }
      })
    );

    expect(calls).toEqual(['secret_word:{"n":1}']);
    expect(events.map((e) => e.type)).toEqual(["text", "tool_call", "tool_result", "text", "done"]);
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 10, outputTokens: 3, cachedTokens: 4 }
    });
    const methods = cli.requests.map((r) => r.method);
    expect(methods).toEqual(["initialize", "session/new", "session/set_model", "session/prompt"]);
    expect(cli.requests[2].params).toEqual({ sessionId: "s1", modelId: "gemini-3.8-flash-low" });
    expect(cli.killed()).toBeGreaterThan(0);
  });

  it("reports a throwing tool to the model as an error, not a failed turn", async () => {
    const cli = fakeAcp(async ({ env }) => {
      const r = await bridgeCall(env, "/call", { name: "boom", arguments: {} });
      expect(r.body.isError).toBe(true);
      expect(r.body.content[0].text).toBe("kaput");
    });
    const events = await collect(
      runAcpTurn({
        spawn: cli.spawn, cwd: null, model: "m", prompt: "p", tools: [tool("boom")],
        executeTool: async () => { throw new Error("kaput"); }
      })
    );
    expect(events.at(-1)?.type).toBe("done");
  });

  it("rejects calls without the token and to tools that were not offered", async () => {
    const cli = fakeAcp(async ({ env }) => {
      expect((await bridgeCall(env, "/tools", {}, "wrong")).status).toBe(401);
      const unknown = await bridgeCall(env, "/call", { name: "rm_rf", arguments: {} });
      expect(unknown.body.isError).toBe(true);
    });
    let executed = 0;
    await collect(
      runAcpTurn({
        spawn: cli.spawn, cwd: null, model: "m", prompt: "p", tools: [tool("ok")],
        executeTool: async () => { executed += 1; return { text: "", isError: false }; }
      })
    );
    expect(executed).toBe(0);
  });

  it("approves only NodeTool tools and denies the CLI's own", async () => {
    const cli = fakeAcp(async ({ ask }) => {
      ask({ toolCall: { name: "run_command" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }] });
      await new Promise((r) => setTimeout(r, 20));
    });
    await collect(
      runAcpTurn({ spawn: cli.spawn, cwd: null, model: "m", prompt: "p", tools: [tool("a")], executeTool: async () => ({ text: "", isError: false }) })
    );
    expect(cli.permissionReplies).toEqual([{ outcome: { outcome: "selected", optionId: "deny" } }]);
    const opts = [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }];
    expect(permissionOutcome({ toolCall: { name: "mcp_nodetool_a" }, options: opts })).toEqual({ outcome: "selected", optionId: "allow" });
    expect(permissionOutcome({ toolCall: { name: "run_command" }, options: [] })).toEqual({ outcome: "cancelled" });
  });

  it("surfaces an ACP error with the sign-in remedy", async () => {
    const spawnFn: AcpSpawner = async () => {
      const out: string[] = [];
      let wake: (() => void) | null = null;
      return {
        lines: (async function* () {
          for (;;) {
            const n = out.shift();
            if (n) yield n;
            else await new Promise<void>((r) => (wake = r));
          }
        })(),
        exit: new Promise(() => undefined),
        kill: () => undefined,
        write: (line) => {
          const m = JSON.parse(line);
          out.push(JSON.stringify({ id: m.id, error: { message: "auth_required: please log in" } }));
          wake?.();
        }
      };
    };
    await expect(
      collect(runAcpTurn({ spawn: spawnFn, cwd: null, model: "m", prompt: "p", tools: [], executeTool: async () => ({ text: "", isError: false }) }))
    ).rejects.toThrow(/sign-in required/);
  });
});

describe("ACP_BRIDGE_SOURCE", () => {
  it("speaks MCP over stdio and forwards to the loopback server", async () => {
    let bridgeEnv: Env = [];
    const cli = fakeAcp(async ({ env }) => {
      bridgeEnv = env;
      const child = spawn(process.execPath, ["-e", ACP_BRIDGE_SOURCE], {
        env: { ...process.env, ...Object.fromEntries(env.map((e) => [e.name, e.value])) }
      });
      const replies: Array<Record<string, any>> = [];
      let buf = "";
      child.stdout.on("data", (d) => {
        buf += String(d);
        for (const l of buf.split("\n").slice(0, -1)) replies.push(JSON.parse(l));
        buf = buf.slice(buf.lastIndexOf("\n") + 1);
      });
      const rpc = (id: number, method: string, params: unknown) =>
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      rpc(1, "initialize", { protocolVersion: "2025-06-18" });
      rpc(2, "tools/list", {});
      rpc(3, "tools/call", { name: "echo", arguments: { n: 5 } });
      rpc(4, "nope", {});
      while (replies.length < 4) await new Promise((r) => setTimeout(r, 10));
      child.kill();
      const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
      expect(byId[1].result.serverInfo.name).toBe("nodetool");
      expect(byId[2].result.tools[0].name).toBe("echo");
      expect(byId[3].result.content[0].text).toBe("echo:5");
      expect(byId[4].error.code).toBe(-32601);
    });
    await collect(
      runAcpTurn({
        spawn: cli.spawn, cwd: null, model: "m", prompt: "p", tools: [tool("echo")],
        executeTool: async (_i, _n, args) => ({ text: `echo:${String(args["n"])}`, isError: false })
      })
    );
    expect(bridgeEnv.find((e) => e.name === "ELECTRON_RUN_AS_NODE")?.value).toBe("1");
  });
});

describe("AntigravityProvider.generateLoop over ACP", () => {
  it("emits chunks, tool calls and persistable messages, then one done chunk", async () => {
    const cli = fakeAcp(async ({ env, update }) => {
      update(text("Checking."));
      await bridgeCall(env, "/call", { name: "secret_word", arguments: {} });
      update(text("Done."));
    });
    const provider = new AntigravityProvider({}, { spawnAcp: cli.spawn });
    expect(await provider.hasToolSupport()).toBe(true);
    const messages: Message[] = [{ role: "user", content: "what is the word" }];
    const items: ProviderStreamItem[] = await collect(
      provider.generateLoop({
        messages,
        model: "gemini-3.8-flash-low",
        tools: [tool("secret_word")],
        executeTool: async () => "PINEAPPLE"
      })
    );

    const shapes = items.map((i) =>
      "type" in i && i.type === "message" ? `message:${i.message.role}` : "type" in i ? i.type : "toolcall"
    );
    expect(shapes).toEqual(["chunk", "toolcall", "message:assistant", "message:tool", "chunk", "message:assistant", "chunk"]);
    const assistant = items.find((i) => "type" in i && i.type === "message" && i.message.role === "assistant");
    expect(assistant).toMatchObject({ message: { content: "Checking.", toolCalls: [{ name: "secret_word" }] } });
    expect(items.at(-1)).toEqual({ type: "chunk", content: "", done: true });
  });
});

describe("generateImageViaAcp", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

  async function brain() {
    const dir = await mkdtemp(join(tmpdir(), "agy-brain-"));
    await mkdir(join(dir, "s1"));
    return dir;
  }

  it("starts the image subagent, waits past the end of the turn and returns the file", async () => {
    const dir = await brain();
    try {
      const cli = fakeAcp(async ({ ask, update }) => {
        ask({ toolCall: { name: "invoke_subagent" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }] });
        update(text("Started."));
        // The turn ends here. The subagent finishes later, in two writes.
        setTimeout(() => void writeFile(join(dir, "s1", "fox_1.png"), PNG.slice(0, 4)), 30);
        setTimeout(() => void writeFile(join(dir, "s1", "fox_1.png"), PNG), 90);
      });
      const image = await generateImageViaAcp({
        spawn: cli.spawn, cwd: null, prompt: "a red fox", aspectRatio: "16:9",
        brainDir: dir, pollMs: 20, settleMs: 200, timeoutMs: 5000
      });
      expect([...image.bytes]).toEqual([...PNG]);
      expect(image.mimeType).toBe("image/png");
      const prompt = cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text as string;
      expect(prompt).toContain('TypeName "image-generator"');
      expect(prompt).toContain("a red fox");
      expect(prompt).toContain("16:9");
      expect(cli.requests.find((r) => r.method === "session/new")?.params["mcpServers"]).toEqual([]);
      expect(cli.permissionReplies).toEqual([{ outcome: { outcome: "selected", optionId: "allow" } }]);
      expect(await readdir(join(dir, "s1"))).toEqual([]);
      expect(cli.killed()).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("denies the CLI's other tools while generating", async () => {
    const dir = await brain();
    try {
      const cli = fakeAcp(async ({ ask }) => {
        ask({ toolCall: { name: "run_command" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }] });
        setTimeout(() => void writeFile(join(dir, "s1", "a.jpg"), PNG), 10);
      });
      const image = await generateImageViaAcp({ spawn: cli.spawn, cwd: null, prompt: "x", brainDir: dir, pollMs: 20, settleMs: 40, timeoutMs: 5000 });
      expect(image.mimeType).toBe("image/jpeg");
      expect(cli.permissionReplies).toEqual([{ outcome: { outcome: "selected", optionId: "deny" } }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("times out with the agent's reply when no image appears", async () => {
    const dir = await brain();
    try {
      const cli = fakeAcp(async ({ update }) => update(text("I cannot do that.")));
      await expect(
        generateImageViaAcp({ spawn: cli.spawn, cwd: null, prompt: "x", brainDir: dir, pollMs: 10, timeoutMs: 150 })
      ).rejects.toThrow(/no image within .*I cannot do that/);
      expect(cli.killed()).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stops waiting when cancelled and cancels the CLI session", async () => {
    const dir = await brain();
    try {
      const cli = fakeAcp(async () => undefined);
      const controller = new AbortController();
      const run = generateImageViaAcp({ spawn: cli.spawn, cwd: null, prompt: "x", brainDir: dir, pollMs: 10, timeoutMs: 5000, signal: controller.signal });
      setTimeout(() => controller.abort(), 80);
      await expect(run).rejects.toThrow(/cancelled/);
      expect(cli.requests.some((r) => r.method === "session/cancel")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("AntigravityProvider images", () => {
  it("lists one image model only when the CLI is usable, and returns the bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agy-brain-"));
    await mkdir(join(dir, "s1"));
    try {
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9]);
      const cli = fakeAcp(async () => {
        setTimeout(() => void writeFile(join(dir, "s1", "i.png"), png), 10);
      });
      const models = (lines: string[]) => async () => ({
        lines: (async function* () { for (const l of lines) yield l; })(),
        exit: Promise.resolve({ code: 0, stderr: "" }),
        kill: () => undefined
      });
      const usable = new AntigravityProvider({}, { spawnAcp: cli.spawn, runCli: models(["gemini-3.8-flash-low"]), imageBrainDir: dir, imagePollMs: 10, imageSettleMs: 40, imageTimeoutMs: 5000 });
      const listed = await usable.getAvailableImageModels();
      expect(listed).toEqual([{ id: "image-generator", name: "Antigravity Image Generator", provider: "antigravity", supportedTasks: ["text_to_image"] }]);
      const bytes = await usable.textToImage({ model: listed[0], prompt: "fox", negativePrompt: "blur" });
      expect([...bytes]).toEqual([...png]);
      expect(cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text).toContain("Avoid: blur");

      const signedOut = new AntigravityProvider({}, { runCli: models([]) });
      expect(await signedOut.getAvailableImageModels()).toEqual([]);
      await expect(usable.textToImage({ model: listed[0], prompt: "  " })).rejects.toThrow(/empty/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runAcpTurn over HTTP MCP", () => {
  const rpc = (url: string, token: string, body: unknown, method = "POST") =>
    fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });

  it("offers an http server with a bearer token and speaks MCP on /mcp", async () => {
    const calls: string[] = [];
    const cli = fakeAcp(async ({ mcp }) => {
      const server = mcp[0];
      expect(server.type).toBe("http");
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const token = String(server.headers[0].value).replace("Bearer ", "");
      expect(server.headers[0].name).toBe("Authorization");

      const init = await (await rpc(server.url, token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
      expect(init.result.serverInfo.name).toBe("nodetool");
      expect((await rpc(server.url, token, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
      const listed = await (await rpc(server.url, token, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
      expect(listed.result.tools.map((t: { name: string }) => t.name)).toEqual(["echo"]);
      const called = await (await rpc(server.url, token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { n: 7 } } })).json();
      expect(called.result).toEqual({ isError: false, content: [{ type: "text", text: "echo:7" }] });
      const unknown = await (await rpc(server.url, token, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "rm", arguments: {} } })).json();
      expect(unknown.result.isError).toBe(true);
      const missing = await (await rpc(server.url, token, { jsonrpc: "2.0", id: 5, method: "nope" })).json();
      expect(missing.error.code).toBe(-32601);
      expect((await rpc(server.url, "wrong", { jsonrpc: "2.0", id: 6, method: "ping" })).status).toBe(401);
      expect((await rpc(server.url, token, null, "GET")).status).toBe(405);
    });
    await collect(
      runAcpTurn({
        spawn: cli.spawn, cwd: null, model: "", prompt: "p", transport: "http", tools: [tool("echo")],
        executeTool: async (_i, name, args) => { calls.push(name); return { text: `echo:${String(args["n"])}`, isError: false }; }
      })
    );
    expect(calls).toEqual(["echo"]);
  });

  it("offers no MCP server when no tools are given", async () => {
    const cli = fakeAcp(async ({ mcp }) => {
      expect(mcp).toEqual([]);
    });
    await collect(runAcpTurn({ spawn: cli.spawn, cwd: null, model: "", prompt: "p", tools: [], executeTool: async () => ({ text: "", isError: false }) }));
    expect(cli.requests.find((r) => r.method === "session/set_model")).toBeUndefined();
    expect(cli.requests.find((r) => r.method === "session/new")?.params["cwd"]).toMatch(/^\//);
  });

  it("matches a permission request to its call by the title of the earlier tool_call update", async () => {
    const options = [{ optionId: "allow_once", kind: "allow_once" }, { optionId: "reject_once", kind: "reject_once" }];
    const replies: unknown[] = [];
    const cli = fakeAcp(async ({ update, ask }) => {
      update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "nodetool-echo" });
      ask({ toolCall: { toolCallId: "c1", title: "echo", kind: "other" }, options });
      await new Promise((r) => setTimeout(r, 10));
      replies.push(...cli.permissionReplies);
    });
    await collect(
      runAcpTurn({
        spawn: cli.spawn, cwd: null, model: "", prompt: "p", tools: [tool("echo")],
        isOwnTool: (call) => call.firstTitle === "nodetool-echo",
        executeTool: async () => ({ text: "", isError: false })
      })
    );
    expect(replies).toEqual([{ outcome: { outcome: "selected", optionId: "allow_once" } }]);

    const cli2 = fakeAcp(async ({ update, ask }) => {
      update({ sessionUpdate: "tool_call", toolCallId: "c2", title: "echo hi" });
      ask({ toolCall: { toolCallId: "c2", title: "echo hi", kind: "execute" }, options });
      await new Promise((r) => setTimeout(r, 10));
    });
    await collect(
      runAcpTurn({
        spawn: cli2.spawn, cwd: null, model: "", prompt: "p", tools: [tool("echo")],
        isOwnTool: (call) => call.firstTitle === "nodetool-echo",
        executeTool: async () => ({ text: "", isError: false })
      })
    );
    expect(cli2.permissionReplies).toEqual([{ outcome: { outcome: "selected", optionId: "reject_once" } }]);
  });
});

describe("listAcpModels", () => {
  it("reads the session's models, drops repeats and entries not enabled", async () => {
    const cli = fakeAcp(async () => undefined, {
      newResult: {
        models: {
          availableModels: [
            { modelId: "auto", name: "Auto" },
            { modelId: "auto", name: "Auto", _meta: { copilotEnablement: "enabled" } },
            { modelId: "gpt-x", name: "GPT X", _meta: { copilotEnablement: "enabled" } },
            { modelId: "locked", name: "Locked", _meta: { copilotEnablement: "disabled" } }
          ]
        }
      }
    });
    expect(await listAcpModels({ spawn: cli.spawn, cwd: null })).toEqual([
      { id: "auto", name: "Auto" },
      { id: "gpt-x", name: "GPT X" }
    ]);
    expect(cli.killed()).toBeGreaterThan(0);
  });
});
