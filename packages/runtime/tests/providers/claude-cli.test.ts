import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClaudeCliError,
  ClaudeCliNotFoundError,
  buildCliArgs,
  buildInitializeRequest,
  handleMcpMessage,
  resolveClaudeCliPath,
  runClaudeCli,
  type ClaudeCliLookupEnv,
  type ClaudeCliMessage,
  type ClaudeCliOptions,
  type ClaudeCliSpawnFn,
  type ClaudeToolServer
} from "../../src/providers/claude-cli.js";
import { ClaudeAgentProvider } from "../../src/providers/claude-agent-provider.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

const FAKE_CLI = fileURLToPath(
  new URL("../fixtures/fake-claude-cli.mjs", import.meta.url)
);

/** Runs the fake CLI under this Node, whatever path the transport asks for. */
const fakeSpawn: ClaudeCliSpawnFn = (_command, args, options) =>
  spawn(process.execPath, [FAKE_CLI, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

function baseOptions(overrides: Partial<ClaudeCliOptions> = {}): ClaudeCliOptions {
  return {
    systemPrompt: "Be terse.",
    allowedTools: [],
    disallowedTools: [],
    tools: [],
    settingSources: [],
    permissionMode: "bypassPermissions",
    strictMcpConfig: true,
    skills: [],
    includePartialMessages: true,
    env: { PATH: process.env.PATH ?? "" },
    abortController: new AbortController(),
    ...overrides
  };
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

let tmp: string | null = null;
async function logFile(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fake-claude-"));
  return path.join(tmp, "log.jsonl");
}
async function readLog(file: string): Promise<{ argv: string[]; frames: Array<Record<string, unknown>> }> {
  const lines = (await fs.readFile(file, "utf8")).trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("buildCliArgs", () => {
  it("maps every option onto the CLI's flags", () => {
    const args = buildCliArgs(
      baseOptions({
        model: "sonnet",
        maxTurns: 7,
        effort: "high",
        thinking: { type: "enabled", budgetTokens: 2048 },
        outputFormat: { type: "json_schema", schema: { type: "object" } },
        allowedTools: ["mcp__nodetool_tools__add"],
        disallowedTools: ["Bash", "ToolSearch"],
        tools: ["Read", "WebSearch"],
        skills: ["brand-voice"],
        allowDangerouslySkipPermissions: true,
        plugins: [{ type: "local", path: "/tmp/skills", skipMcpDiscovery: true }],
        resume: "sess-1"
      })
    );
    expect(args.slice(0, 6)).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--input-format",
      "stream-json"
    ]);
    const flag = (name: string) => args[args.indexOf(name) + 1];
    expect(flag("--model")).toBe("sonnet");
    expect(flag("--max-turns")).toBe("7");
    expect(flag("--effort")).toBe("high");
    expect(flag("--max-thinking-tokens")).toBe("2048");
    expect(flag("--json-schema")).toBe('{"type":"object"}');
    expect(flag("--allowedTools")).toBe("mcp__nodetool_tools__add,Skill(brand-voice)");
    expect(flag("--disallowedTools")).toBe("Bash,ToolSearch");
    expect(flag("--tools")).toBe("Read,WebSearch");
    expect(flag("--permission-mode")).toBe("bypassPermissions");
    expect(flag("--plugin-dir-no-mcp")).toBe("/tmp/skills");
    expect(args).toContain("--setting-sources=");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--allow-dangerously-skip-permissions");
    expect(args).toContain("--include-partial-messages");
    expect(args).toContain("--resume=sess-1");
    // The system prompt travels in the initialize request, never on argv.
    expect(args.join(" ")).not.toContain("Be terse.");
  });

  it("disables every built-in with an empty --tools and maps thinking modes", () => {
    const args = buildCliArgs(baseOptions({ thinking: { type: "adaptive" } }));
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--thinking") + 1]).toBe("adaptive");
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--model");
    const disabled = buildCliArgs(baseOptions({ thinking: { type: "disabled" } }));
    expect(disabled[disabled.indexOf("--thinking") + 1]).toBe("disabled");
  });

  it("puts the system prompt, schema, skills and served servers in initialize", () => {
    const server: ClaudeToolServer = { name: "nodetool_tools", version: "1", tools: [] };
    expect(
      buildInitializeRequest(
        baseOptions({
          mcpServers: { nodetool_tools: server },
          skills: ["a"],
          outputFormat: { type: "json_schema", schema: { type: "object" } }
        })
      )
    ).toEqual({
      subtype: "initialize",
      systemPrompt: ["Be terse."],
      sdkMcpServers: ["nodetool_tools"],
      jsonSchema: { type: "object" },
      skills: ["a"]
    });
  });
});

describe("handleMcpMessage", () => {
  const server: ClaudeToolServer = {
    name: "nodetool_tools",
    version: "1.0.0",
    tools: [
      {
        name: "add",
        description: "Add",
        inputSchema: { type: "object", properties: { a: { type: "number" } } },
        handler: async (args) => ({
          content: [{ type: "text", text: String(Number(args.a) + 1) }]
        })
      },
      {
        name: "boom",
        description: "Fails",
        inputSchema: { type: "object" },
        handler: async () => {
          throw new Error("tool exploded");
        }
      }
    ]
  };

  it("answers initialize with the requested protocol and tools capability", async () => {
    expect(
      await handleMcpMessage(server, {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-11-25" }
      })
    ).toEqual({
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "nodetool_tools", version: "1.0.0" }
      }
    });
  });

  it("lists tools with their JSON Schema and runs a call", async () => {
    const listed = await handleMcpMessage(server, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(listed.result).toEqual({
      tools: [
        { name: "add", description: "Add", inputSchema: { type: "object", properties: { a: { type: "number" } } } },
        { name: "boom", description: "Fails", inputSchema: { type: "object" } }
      ]
    });
    const called = await handleMcpMessage(server, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "add", arguments: { a: 41 } }
    });
    expect(called.result).toEqual({ content: [{ type: "text", text: "42" }] });
  });

  it("returns a thrown tool error as an error result, and unknown names as protocol errors", async () => {
    const failed = await handleMcpMessage(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "boom", arguments: {} }
    });
    expect(failed.result).toEqual({
      content: [{ type: "text", text: "tool exploded" }],
      isError: true
    });
    const unknown = await handleMcpMessage(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "missing" }
    });
    expect(unknown.error).toMatchObject({ code: -32602 });
    const method = await handleMcpMessage(server, { jsonrpc: "2.0", id: 5, method: "resources/list" });
    expect(method.error).toMatchObject({ code: -32601 });
  });

  it("acknowledges notifications", async () => {
    expect(
      await handleMcpMessage(server, { jsonrpc: "2.0", method: "notifications/initialized" })
    ).toEqual({ jsonrpc: "2.0", result: {}, id: 0 });
  });
});

describe("resolveClaudeCliPath", () => {
  const lookup = (
    platform: NodeJS.Platform,
    existing: string[],
    env: Record<string, string> = {}
  ): ClaudeCliLookupEnv & { probed: string[] } => {
    const probed: string[] = [];
    return {
      platform,
      homedir: platform === "win32" ? "C:\\Users\\ada" : "/home/ada",
      env,
      probed,
      isExecutable: async (file) => {
        probed.push(file);
        return existing.includes(file);
      }
    };
  };

  it("uses the configured path when it is executable", async () => {
    const env = lookup("linux", ["/opt/claude/bin/claude"]);
    await expect(resolveClaudeCliPath("/opt/claude/bin/claude", env)).resolves.toBe("/opt/claude/bin/claude");
  });

  it("fails on a configured path that does not exist instead of guessing", async () => {
    const env = lookup("linux", ["/home/ada/.local/bin/claude"]);
    await expect(resolveClaudeCliPath("/nope/claude", env)).rejects.toThrow(ClaudeCliNotFoundError);
    await expect(resolveClaudeCliPath("/nope/claude", env)).rejects.toThrow(/CLAUDE_CLI_PATH points to \/nope\/claude/);
  });

  it("prefers PATH over the install locations", async () => {
    const env = lookup("linux", ["/usr/local/bin/claude", "/home/ada/bin/claude"], {
      PATH: "/usr/bin:/home/ada/bin/"
    });
    await expect(resolveClaudeCliPath(undefined, env)).resolves.toBe("/home/ada/bin/claude");
  });

  it("finds the native installer's ~/.local/bin when PATH lacks it", async () => {
    const env = lookup("darwin", ["/home/ada/.local/bin/claude", "/opt/homebrew/bin/claude"], {
      PATH: "/usr/bin:/bin"
    });
    await expect(resolveClaudeCliPath(undefined, env)).resolves.toBe("/home/ada/.local/bin/claude");
  });

  it("falls back through the Homebrew and npm locations", async () => {
    const env = lookup("darwin", ["/opt/homebrew/bin/claude"], { PATH: "" });
    await expect(resolveClaudeCliPath(undefined, env)).resolves.toBe("/opt/homebrew/bin/claude");
    expect(env.probed).toContain("/home/ada/.claude/local/claude");
  });

  it("looks for claude.exe on Windows PATH and in the user's .local\\bin", async () => {
    const onPath = lookup("win32", ["C:\\tools\\claude.exe"], { Path: "C:\\Windows;C:\\tools\\" });
    await expect(resolveClaudeCliPath(undefined, onPath)).resolves.toBe("C:\\tools\\claude.exe");
    const local = lookup("win32", ["C:\\Users\\ada\\.local\\bin\\claude.exe"], { Path: "C:\\Windows" });
    await expect(resolveClaudeCliPath(undefined, local)).resolves.toBe("C:\\Users\\ada\\.local\\bin\\claude.exe");
    expect(local.probed.every((file) => file.endsWith("claude.exe"))).toBe(true);
  });

  it("explains how to install when nothing is found", async () => {
    const env = lookup("linux", [], { PATH: "/usr/bin" });
    await expect(resolveClaudeCliPath(undefined, env)).rejects.toThrow(/Install Claude Code.*CLAUDE_CLI_PATH/);
  });
});

describe("runClaudeCli against a fake CLI", () => {
  it("sends initialize then the prompt, and streams messages until the result", async () => {
    const log = await logFile();
    const messages = await collect(
      runClaudeCli({
        cliPath: "claude",
        spawn: fakeSpawn,
        prompt: "hi",
        options: baseOptions({
          model: "haiku",
          env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_LOG: log, NODE_OPTIONS: "--inspect" }
        })
      })
    );
    expect(messages.map((m) => m.type)).toEqual([
      "system",
      "stream_event",
      "stream_event",
      "assistant",
      "result"
    ]);
    const { argv, frames } = await readLog(log);
    expect(argv).toContain("--model");
    expect(frames[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "initialize", systemPrompt: ["Be terse."] }
    });
    expect(frames[1]).toEqual({
      type: "user",
      session_id: "",
      parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "text", text: "hi" }] }
    });
  });

  it("serves host tools over mcp_message control requests", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const server: ClaudeToolServer = {
      name: "nodetool_tools",
      version: "1.0.0",
      tools: [
        {
          name: "add",
          description: "Add two numbers",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"]
          },
          handler: async (args) => {
            seen.push(args);
            return { content: [{ type: "text", text: String(Number(args.a) + Number(args.b)) }] };
          }
        }
      ]
    };
    const messages = await collect(
      runClaudeCli({
        cliPath: "claude",
        spawn: fakeSpawn,
        prompt: "add",
        options: baseOptions({
          mcpServers: { nodetool_tools: server },
          env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_MODE: "tool" }
        })
      })
    );
    expect(seen).toEqual([{ a: 2, b: 40 }]);
    const final = messages.filter((m) => m.type === "assistant").at(-1) as Extract<ClaudeCliMessage, { type: "assistant" }>;
    expect(final.message?.content?.[0]?.text).toBe(
      'protocol=2025-11-25; tools=add; schema={"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}; result=42; unknown=-32602'
    );
  });

  it("fails with the exit code and stderr when the CLI dies", async () => {
    await expect(
      collect(
        runClaudeCli({
          cliPath: "claude",
          spawn: fakeSpawn,
          prompt: "hi",
          options: baseOptions({ env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_MODE: "fail" } })
        })
      )
    ).rejects.toThrow(/exited with code 3\. stderr: fake failure: not logged in/);
  });

  it("fails when the CLI exits cleanly without a result", async () => {
    await expect(
      collect(
        runClaudeCli({
          cliPath: "claude",
          spawn: fakeSpawn,
          prompt: "hi",
          options: baseOptions({ env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_MODE: "no_result" } })
        })
      )
    ).rejects.toThrow(ClaudeCliError);
  });

  it("fails when the CLI rejects the initialize request", async () => {
    await expect(
      collect(
        runClaudeCli({
          cliPath: "claude",
          spawn: fakeSpawn,
          prompt: "hi",
          options: baseOptions({ env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_MODE: "reject_init" } })
        })
      )
    ).rejects.toThrow(/rejected the session: bad initialize/);
  });

  it("reports a missing executable as ClaudeCliNotFoundError", async () => {
    await expect(
      collect(
        runClaudeCli({
          cliPath: path.join(os.tmpdir(), "definitely-not-claude"),
          prompt: "hi",
          options: baseOptions()
        })
      )
    ).rejects.toThrow(ClaudeCliNotFoundError);
  });

  it("kills a hanging CLI on abort and ends the stream quietly", async () => {
    const options = baseOptions({ env: { PATH: process.env.PATH ?? "", FAKE_CLAUDE_MODE: "hang" } });
    const seen: string[] = [];
    for await (const msg of runClaudeCli({ cliPath: "claude", spawn: fakeSpawn, prompt: "hi", options })) {
      seen.push(msg.type);
      if (msg.type === "stream_event") options.abortController.abort();
    }
    expect(seen).toEqual(["system", "stream_event"]);
  });
});

describe("ClaudeAgentProvider over the fake CLI", () => {
  async function items(provider: ClaudeAgentProvider, run: (p: ClaudeAgentProvider) => AsyncGenerator<ProviderStreamItem>) {
    return collect(run(provider));
  }

  it("streams text, tracks usage and records the session from a real process", async () => {
    const previous = process.env.FAKE_CLAUDE_MODE;
    process.env.FAKE_CLAUDE_MODE = "text";
    try {
      const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: process.execPath }, { spawn: fakeSpawn });
      const out = await items(provider, (p) =>
        p.generateMessages({ messages: [{ role: "user", content: "hi" }], model: "haiku", threadId: "t1" })
      );
      const text = out
        .filter((i): i is Extract<ProviderStreamItem, { type: "chunk" }> => "type" in i && i.type === "chunk")
        .map((i) => i.content)
        .join("");
      expect(text).toBe("hello from fake");
      expect(out.find((i) => "type" in i && i.type === "session")).toMatchObject({
        session: { token: "fake-session", providerId: "claude_agent_sdk" }
      });
      expect(provider.getTotalCost()).toBeGreaterThanOrEqual(0);
    } finally {
      if (previous === undefined) delete process.env.FAKE_CLAUDE_MODE;
      else process.env.FAKE_CLAUDE_MODE = previous;
    }
  });

  it("runs a NodeTool tool through the CLI loop and emits tool messages", async () => {
    const previous = process.env.FAKE_CLAUDE_MODE;
    process.env.FAKE_CLAUDE_MODE = "tool";
    try {
      const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: process.execPath }, { spawn: fakeSpawn });
      const out = await items(provider, (p) =>
        p.generateLoop({
          messages: [{ role: "user", content: "add" }],
          model: "haiku",
          tools: [
            {
              name: "add",
              description: "Add",
              inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } }
            }
          ],
          executeTool: async (call) => String(Number(call.args.a) + Number(call.args.b))
        })
      );
      const toolCall = out.find((i) => "args" in i);
      expect(toolCall).toMatchObject({ id: "toolu_1", name: "add", args: { a: 2, b: 40 } });
      const toolMessage = out.find(
        (i) => "type" in i && i.type === "message" && i.message.role === "tool"
      );
      expect(toolMessage).toMatchObject({ message: { toolCallId: "toolu_1", content: "42" } });
    } finally {
      if (previous === undefined) delete process.env.FAKE_CLAUDE_MODE;
      else process.env.FAKE_CLAUDE_MODE = previous;
    }
  });

  it("rejects a CLAUDE_CLI_PATH that does not exist", async () => {
    const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: path.join(os.tmpdir(), "no-claude-here") });
    await expect(
      provider.generateMessage({ messages: [{ role: "user", content: "hi" }], model: "haiku" })
    ).rejects.toThrow(/CLAUDE_CLI_PATH points to/);
  });
});
