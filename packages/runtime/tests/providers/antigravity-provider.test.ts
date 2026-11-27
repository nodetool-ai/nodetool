import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { getAntigravityBinaryPath } from "@nodetool-ai/antigravity-cli";
import { describe, it, expect, vi } from "vitest";
import {
  ACP_AGENT_FILE,
  ACP_TOOL_TURN_ARGS,
  AntigravityProvider,
  buildCliArgs,
  buildFreshPrompt,
  parseModelSlugs,
  type AntigravityCliRun,
  type AntigravityCliRunner
} from "../../src/providers/antigravity-provider.js";
import type {
  Message,
  ProviderSession,
  ProviderStreamItem
} from "../../src/providers/types.js";
import { HOST_TOOLS_ONLY_NOTICE } from "../../src/providers/acp-cli-provider.js";
import { bridgeCall, fakeAcp, text, tool } from "./fake-acp.js";

interface Call {
  args: string[];
  stdin: string;
  cwd: string | null;
}

/** A fake `agy` that prints `stdout` lines and exits with `code`. */
function fakeRunner(
  script: (call: Call) => { stdout: string[]; code?: number; stderr?: string }
): { runCli: AntigravityCliRunner; calls: Call[]; killed: () => number } {
  const calls: Call[] = [];
  let kills = 0;
  const runCli: AntigravityCliRunner = async (args, options) => {
    const call = { args, stdin: options.stdin, cwd: options.cwd };
    calls.push(call);
    const { stdout, code = 0, stderr = "" } = script(call);
    const run: AntigravityCliRun = {
      lines: (async function* () {
        yield* stdout;
      })(),
      exit: Promise.resolve({ code, stderr }),
      kill: () => {
        kills += 1;
      }
    };
    return run;
  };
  return { runCli, calls, killed: () => kills };
}

const line = (event: Record<string, unknown>) => JSON.stringify(event);

const successTurn = (conversationId: string, deltas: string[]) => [
  line({ event: "init", cwd: "/tmp", tools: [], permission_mode: "request-review" }),
  ...deltas.map((text_delta, step_index) =>
    line({
      event: "step_update",
      conversation_id: conversationId,
      step_index,
      state: "ACTIVE",
      step_type: "agent_response",
      text_delta
    })
  ),
  line({
    event: "result",
    conversation_id: conversationId,
    status: "SUCCESS",
    response: deltas.join(""),
    num_turns: 1,
    usage: {
      input_tokens: 12,
      output_tokens: 3,
      thinking_tokens: 2,
      cache_read_tokens: 4,
      total_tokens: 17
    }
  })
];

async function collect(
  gen: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

const user = (content: string): Message => ({ role: "user", content });

describe("AntigravityProvider", () => {
  it("kills a run cancelled while the CLI runner is starting without waiting for stdout", async () => {
    const started = Promise.withResolvers<void>();
    const spawning = Promise.withResolvers<AntigravityCliRun>();
    const eof = Promise.withResolvers<void>();
    const kill = vi.fn();
    const signal = new AbortController();
    const provider = new AntigravityProvider({}, {
      runCli: async (_args, options) => {
        expect(options.signal).toBe(signal.signal);
        started.resolve();
        return spawning.promise;
      }
    });
    const result = collect(provider.generateMessages({
      messages: [user("hello")], model: "gemini-3.1-pro-high", signal: signal.signal
    }));
    await started.promise;
    signal.abort();
    spawning.resolve({
      lines: (async function* () { await eof.promise; })(),
      exit: Promise.resolve({ code: null, stderr: "" }),
      kill
    });
    try {
      await expect.poll(() => kill.mock.calls.length).toBeGreaterThan(0);
      await expect(result).resolves.toEqual([]);
    } finally {
      eof.resolve();
      await result;
    }
  });

  it("reads the nested event shape of agy 1.5.3", async () => {
    const conversation_id = "conv-n";
    const { runCli } = fakeRunner(() => ({
      stdout: [
        line({ event: "init", init: { cwd: "/tmp" } }),
        line({
          event: "step_update",
          step_update: { conversation_id, step_type: "agent_response", text_delta: "Hi" }
        }),
        line({
          event: "result",
          result: { conversation_id, status: "SUCCESS", response: "Hi" }
        })
      ]
    }));
    const provider = new AntigravityProvider({}, { runCli });

    const items = await collect(
      provider.generateMessages({ messages: [user("hi")], model: "gemini-3.8-flash-low" })
    );

    expect(items).toEqual([
      { type: "chunk", content: "Hi", done: false },
      { type: "chunk", content: "", done: true }
    ]);
  });

  it("streams text deltas and ends with one done chunk", async () => {
    const { runCli, calls } = fakeRunner(() => ({
      stdout: successTurn("conv-1", ["Hel", "lo"])
    }));
    const provider = new AntigravityProvider({}, { runCli });

    const items = await collect(
      provider.generateMessages({
        messages: [{ role: "system", content: "Be terse." }, user("Say hello")],
        model: "gemini-3.1-pro-high",
        effort: "max"
      })
    );

    expect(items).toEqual([
      { type: "chunk", content: "Hel", done: false },
      { type: "chunk", content: "lo", done: false },
      { type: "chunk", content: "", done: true }
    ]);
    expect(calls[0].args).toEqual([
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      "gemini-3.1-pro-high",
      "--effort",
      "high"
    ]);
    expect(calls[0].args).not.toContain("--dangerously-skip-permissions");
    const prompt = JSON.parse(calls[0].stdin.trim()) as {
      event: string;
      message: { content: string };
    };
    expect(prompt.event).toBe("user");
    expect(prompt.message.content).toBe(
      "<instructions>\nBe terse.\n</instructions>\n\nSay hello"
    );
    expect(calls[0].cwd).toMatch(/nodetool-antigravity$/);
    expect(provider.getTotalCost()).toBeGreaterThanOrEqual(0);
  });

  it("emits a session and resumes the conversation with only the new turn", async () => {
    const { runCli, calls } = fakeRunner(() => ({
      stdout: successTurn("conv-7", ["ok"])
    }));
    const provider = new AntigravityProvider({}, { runCli });

    const first = await collect(
      provider.generateMessages({
        messages: [user("one")],
        model: "m-1",
        threadId: "t1"
      })
    );
    const session = first.find(
      (item): item is { type: "session"; session: ProviderSession } =>
        "type" in item && item.type === "session"
    )?.session;
    expect(session).toMatchObject({
      providerId: "antigravity",
      model: "m-1",
      token: "conv-7",
      checkpoint: 1
    });

    await collect(
      provider.generateMessages({
        messages: [user("one"), { role: "assistant", content: "ok" }, user("two")],
        model: "m-1",
        threadId: "t1",
        providerSession: session
      })
    );
    expect(calls[1].args).toContain("--conversation");
    expect(calls[1].args[calls[1].args.indexOf("--conversation") + 1]).toBe(
      "conv-7"
    );
    expect(JSON.parse(calls[1].stdin.trim()).message.content).toBe("two");
  });

  it("falls back to a fresh conversation when the resume fails before any output", async () => {
    const { runCli, calls } = fakeRunner((call) =>
      call.args.includes("--conversation")
        ? { stdout: [], code: 1, stderr: "conversation not found" }
        : { stdout: successTurn("conv-2", ["fresh"]) }
    );
    const provider = new AntigravityProvider({}, { runCli });

    const message = await provider.generateMessage({
      messages: [user("one"), { role: "assistant", content: "ok" }, user("two")],
      model: "m-1",
      providerSession: {
        providerId: "antigravity",
        model: "m-1",
        token: "gone",
        checkpoint: 1
      }
    });

    expect(message.content).toBe("fresh");
    expect(calls).toHaveLength(2);
    expect(calls[1].args).not.toContain("--conversation");
    expect(JSON.parse(calls[1].stdin.trim()).message.content).toContain(
      "<conversation_so_far>\nUser: one\n\nAssistant: ok\n</conversation_so_far>"
    );
  });

  it("returns structured output as the forced tool call", async () => {
    const { runCli, calls } = fakeRunner(() => ({
      stdout: [
        line({
          event: "result",
          conversation_id: "conv-3",
          status: "SUCCESS",
          response: '{"label":"spam"}',
          structured_output: { label: "spam" }
        })
      ]
    }));
    const provider = new AntigravityProvider({}, { runCli });
    const schema = {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"]
    };

    const message = await provider.generateMessage({
      messages: [user("Classify: buy now")],
      model: "m-1",
      tools: [{ name: "classify", inputSchema: schema }],
      toolChoice: "classify"
    });

    expect(message.toolCalls).toEqual([
      { id: "result_conv-3", name: "classify", args: { label: "spam" } }
    ]);
    const jsonSchema = calls[0].args[calls[0].args.indexOf("--json-schema") + 1];
    expect(JSON.parse(jsonSchema)).toEqual(schema);
  });

  it("surfaces an ERROR result with the CLI's reason", async () => {
    const { runCli } = fakeRunner(() => ({
      stdout: [
        line({
          event: "result",
          status: "ERROR",
          error: { type: "model", message: "unknown model: nope" }
        })
      ],
      code: 1
    }));
    const provider = new AntigravityProvider({}, { runCli });

    await expect(
      provider.generateMessage({ messages: [user("hi")], model: "nope" })
    ).rejects.toThrow("agy returned ERROR: unknown model: nope");
  });

  it("tells the user to sign in when the CLI is unauthenticated", async () => {
    const { runCli } = fakeRunner(() => ({
      stdout: [],
      code: 1,
      stderr: "Error: authentication required"
    }));
    const provider = new AntigravityProvider({}, { runCli });

    await expect(
      provider.generateMessage({ messages: [user("hi")], model: "m-1" })
    ).rejects.toThrow(/Antigravity sign-in required.*Run `agy` once/);
  });

  it("refuses image input instead of dropping it", async () => {
    const { runCli, calls } = fakeRunner(() => ({ stdout: [] }));
    const provider = new AntigravityProvider({}, { runCli });

    await expect(
      provider.generateMessage({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is this?" },
              { type: "image_url", image: { uri: "data:image/png;base64,AA==" } }
            ]
          }
        ],
        model: "m-1"
      })
    ).rejects.toThrow("text prompts only");
    expect(calls).toHaveLength(0);
  });

  it("kills the process when the consumer stops early", async () => {
    const { runCli, killed } = fakeRunner(() => ({
      stdout: successTurn("conv-4", ["a", "b", "c"])
    }));
    const provider = new AntigravityProvider({}, { runCli });
    const gen = provider.generateMessages({ messages: [user("hi")], model: "m-1" });

    const first = await gen.next();
    expect(first.done).toBe(false);
    await gen.return(undefined);

    expect(killed()).toBe(1);
  });

  it("lists the models agy reports and none when it fails", async () => {
    const ok = fakeRunner(() => ({
      stdout: [
        "Available models:",
        "  gemini-3.1-pro-high  (default)",
        "  - claude-sonnet-4-6",
        "",
        "gpt-oss-120b-medium"
      ]
    }));
    const models = await new AntigravityProvider(
      {},
      { runCli: ok.runCli }
    ).getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro High", provider: "antigravity" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4 6", provider: "antigravity" },
      { id: "gpt-oss-120b-medium", name: "Gpt Oss 120b Medium", provider: "antigravity" }
    ]);
    expect(ok.calls[0].args).toEqual(["models"]);

    const signedOut = fakeRunner(() => ({ stdout: [], code: 1, stderr: "sign in" }));
    await expect(
      new AntigravityProvider({}, { runCli: signedOut.runCli }).getAvailableLanguageModels()
    ).resolves.toEqual([]);
  });

  it("reports a missing CLI as unavailable", async () => {
    const provider = new AntigravityProvider(
      {},
      {
        runCli: async () => {
          throw new Error("Antigravity CLI (agy) not found.");
        }
      }
    );
    await expect(provider.unavailableReason()).resolves.toBe(
      "Antigravity CLI (agy) not found."
    );
  });

  it("needs no secrets and takes tools through generateLoop", async () => {
    expect(AntigravityProvider.requiredSecrets()).toEqual([]);
    await expect(new AntigravityProvider().hasToolSupport()).resolves.toBe(true);
  });
});

describe("AntigravityProvider over agy acp", () => {
  const agentPath = (cwd: string) => join(cwd, ".agents", "agents", "nodetool-mcp", "agent.md");

  /** A runner that records each `agy` invocation and serves it with a fake ACP server. */
  function acpRunner(cli: ReturnType<typeof fakeAcp>, onSpawn?: (args: string[], cwd: string | null) => Promise<void>) {
    const calls: Array<{ args: string[]; cwd: string | null }> = [];
    const runCli: AntigravityCliRunner = async (args, options) => {
      if (args[0] === "models") {
        return {
          lines: (async function* () {
            yield "gemini-3.8-flash-low";
          })(),
          exit: Promise.resolve({ code: 0, stderr: "" }),
          kill: () => undefined
        };
      }
      calls.push({ args, cwd: options.cwd });
      await onSpawn?.(args, options.cwd);
      return cli.spawn({ cwd: options.cwd, signal: options.signal });
    };
    return { runCli, calls };
  }

  it("runs tool turns on the tool-less nodetool-mcp agent written before agy starts", async () => {
    const cli = fakeAcp(async ({ env, update }) => {
      await bridgeCall(env, "/call", { name: "secret_word", arguments: {} });
      update(text("PINEAPPLE"));
    });
    let agentAtSpawn = "";
    const { runCli, calls } = acpRunner(cli, async (_args, cwd) => {
      agentAtSpawn = await readFile(agentPath(cwd ?? ""), "utf8");
    });
    const provider = new AntigravityProvider({}, { runCli });
    const items = await collect(
      provider.generateLoop({
        messages: [user("what is the word")],
        model: "gemini-3.8-flash-low",
        tools: [tool("secret_word")],
        executeTool: async () => "PINEAPPLE"
      })
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["acp", "--agent", "nodetool-mcp", "--include-default-customizations=false"]);
    expect(ACP_TOOL_TURN_ARGS).toEqual(calls[0].args);
    expect(basename(calls[0].cwd ?? "")).toBe("nodetool-antigravity");
    expect(agentAtSpawn).toBe(ACP_AGENT_FILE);
    expect(agentAtSpawn).toMatch(/^---\nname: nodetool-mcp\n[\s\S]*mainAgent: true\ntools: \[\]\n---\n/);
    const prompt = cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text;
    expect(prompt).toContain(HOST_TOOLS_ONLY_NOTICE);
    expect(items.at(-1)).toEqual({ type: "chunk", content: "", done: true });
  });

  it("rewrites an edited agent file on the next tool turn", async () => {
    const cli = fakeAcp(async ({ update }) => update(text("ok")));
    const { runCli, calls } = acpRunner(cli);
    const provider = new AntigravityProvider({}, { runCli });
    const turn = () =>
      provider.generateLoop({
        messages: [user("hi")],
        model: "gemini-3.8-flash-low",
        tools: [tool("secret_word")],
        executeTool: async () => "x"
      });
    await collect(turn());
    const file = agentPath(calls[0].cwd ?? "");
    await writeFile(file, "---\nname: nodetool-mcp\ntools: [run_command]\n---\n");
    await collect(turn());
    expect(await readFile(file, "utf8")).toBe(ACP_AGENT_FILE);
  });

  it("generates images on plain agy acp, away from the tool-less agent", async () => {
    const brainDir = await mkdtemp(join(tmpdir(), "agy-brain-"));
    try {
      await mkdir(join(brainDir, "s1"));
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 7]);
      const cli = fakeAcp(async () => {
        setTimeout(() => void writeFile(join(brainDir, "s1", "i.png"), png), 10);
      });
      const { runCli, calls } = acpRunner(cli);
      const provider = new AntigravityProvider(
        {},
        { runCli, imageBrainDir: brainDir, imagePollMs: 10, imageSettleMs: 40, imageTimeoutMs: 5000 }
      );
      const [model] = await provider.getAvailableImageModels();
      const bytes = await provider.textToImage({ model, prompt: "fox" });

      expect([...bytes]).toEqual([...png]);
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toEqual(["acp"]);
      expect(basename(calls[0].cwd ?? "")).toBe("nodetool-antigravity-image");
      await expect(stat(agentPath(calls[0].cwd ?? ""))).rejects.toThrow();
      const prompt = cli.requests.find((r) => r.method === "session/prompt")?.params["prompt"][0].text;
      expect(prompt).toContain("image-generator");
    } finally {
      await rm(brainDir, { recursive: true, force: true });
    }
  });
});

describe("antigravity helpers", () => {
  it("parseModelSlugs skips headers and duplicates", () => {
    expect(parseModelSlugs(["Models", "gemini-3.6-flash-low", "gemini-3.6-flash-low"])).toEqual([
      "gemini-3.6-flash-low"
    ]);
  });

  it("buildCliArgs maps low and medium effort through unchanged", () => {
    expect(
      buildCliArgs({ model: "", conversation: null, effort: "medium", resultTool: undefined })
    ).toEqual([
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--effort",
      "medium"
    ]);
  });

  it("buildFreshPrompt sends a lone user turn verbatim", () => {
    expect(buildFreshPrompt([user("hi")], "")).toBe("hi");
  });

  it("buildFreshPrompt adds the host-tools notice to the instructions on tool turns", () => {
    expect(buildFreshPrompt([user("hi")], "Be brief.", "Antigravity CLI", { hostToolsOnly: true })).toBe(
      `<instructions>\nBe brief.\n\n${HOST_TOOLS_ONLY_NOTICE}\n</instructions>\n\nhi`
    );
    expect(buildFreshPrompt([user("hi")], "", "Antigravity CLI", { hostToolsOnly: true })).toBe(
      `<instructions>\n${HOST_TOOLS_ONLY_NOTICE}\n</instructions>\n\nhi`
    );
  });
});

it.skipIf(process.platform === "win32")("discovers models through the NodeTool-managed executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "nodetool-agy-provider-"));
  vi.stubEnv("XDG_DATA_HOME", root);
  try {
    const binary = getAntigravityBinaryPath();
    await mkdir(dirname(binary), { recursive: true });
    await writeFile(binary, "#!/bin/sh\nprintf 'gemini-3.1-pro-high\\n'\n", { mode: 0o755 });
    const provider = new AntigravityProvider();
    expect(await provider.unavailableReason()).toBeNull();
    expect(await provider.getAvailableLanguageModels()).toEqual([
      { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro High", provider: "antigravity" }
    ]);
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

describe("AntigravityProvider.webSearch", () => {
  const searchStep = line({
    event: "step_update",
    step_update: {
      conversation_id: "conv-s",
      state: "DONE",
      step_type: "tool",
      tool_name: "search_web",
      tool_info: { name: "search_web", parameters: { query: "q" }, output: "..." }
    }
  });
  const searchResult = (structured_output: unknown) =>
    line({
      event: "result",
      result: { conversation_id: "conv-s", status: "SUCCESS", structured_output }
    });

  it("runs one headless turn with the result schema and reads the pages", async () => {
    const { runCli, calls } = fakeRunner(() => ({
      stdout: [
        searchStep,
        searchResult({
          answer: " NodeTool is a workflow tool. ",
          results: [
            { title: "NodeTool", url: "https://nodetool.ai/", snippet: "Build AI workflows." },
            { title: "Dup", url: "https://nodetool.ai/", snippet: "again" },
            { title: "", url: "https://github.com/nodetool-ai/nodetool", snippet: "Repo" },
            { title: "Local", url: "file:///etc/passwd", snippet: "no" }
          ]
        })
      ]
    }));
    const provider = new AntigravityProvider({}, { runCli });
    const search = await provider.webSearch("what is nodetool");

    expect(search.answer).toBe("NodeTool is a workflow tool.");
    expect(search.results).toEqual([
      { title: "NodeTool", url: "https://nodetool.ai/", snippet: "Build AI workflows." },
      {
        title: "https://github.com/nodetool-ai/nodetool",
        url: "https://github.com/nodetool-ai/nodetool",
        snippet: "Repo"
      }
    ]);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.args).toContain("--json-schema");
    expect(call.args).toContain("--disable-slash-commands");
    expect(call.args).not.toContain("--dangerously-skip-permissions");
    expect(call.args).not.toContain("--agent");
    expect(basename(call.cwd ?? "")).toBe("nodetool-antigravity-search");
    const sent = JSON.parse(call.stdin) as { message: { content: string } };
    expect(sent.message.content).toContain("search_web");
    expect(sent.message.content).toContain("Query: what is nodetool");
  });

  it("fails when the CLI answered without running search_web", async () => {
    const { runCli } = fakeRunner(() => ({
      stdout: [
        line({ event: "step_update", step_type: "tool", tool_name: "view_file" }),
        searchResult({
          answer: "From memory",
          results: [{ title: "Made up", url: "https://example.com", snippet: "" }]
        })
      ],
      stderr: "search_web was soft-denied; allow read_url to run it"
    }));
    const provider = new AntigravityProvider({}, { runCli });
    await expect(provider.webSearch("q")).rejects.toThrow(
      /without running search_web \(ran view_file\): search_web was soft-denied/
    );
  });

  it("fails when the result carries no structured output", async () => {
    const { runCli } = fakeRunner(() => ({
      stdout: [searchStep, searchResult(undefined)]
    }));
    const provider = new AntigravityProvider({}, { runCli });
    await expect(provider.webSearch("q")).rejects.toThrow(
      /no structured search results/
    );
  });

  it("names the sign-in remedy when the CLI is not signed in", async () => {
    const { runCli } = fakeRunner(() => ({
      stdout: [],
      code: 1,
      stderr: "authentication required"
    }));
    const provider = new AntigravityProvider({}, { runCli });
    await expect(provider.webSearch("q")).rejects.toThrow(
      /Antigravity sign-in required/
    );
  });

  it("rejects an empty query without starting the CLI", async () => {
    const { runCli, calls } = fakeRunner(() => ({ stdout: [] }));
    const provider = new AntigravityProvider({}, { runCli });
    await expect(provider.webSearch("  ")).rejects.toThrow(/cannot be empty/);
    expect(calls).toHaveLength(0);
  });
});
