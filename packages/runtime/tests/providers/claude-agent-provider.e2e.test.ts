/**
 * End-to-end tests of ClaudeAgentProvider against the real Claude Code CLI.
 *
 * They spend subscription usage, so they run only when asked:
 *
 *   NODETOOL_CLAUDE_CLI_E2E=1 npx vitest run tests/providers/claude-agent-provider.e2e.test.ts
 *
 * The CLI is found the way the provider finds it (CLAUDE_CLI_PATH, PATH, then
 * the install locations) and must be signed in. NODETOOL_CLAUDE_CLI_E2E_MODEL
 * picks the model (default `haiku`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { ClaudeAgentProvider } from "../../src/providers/claude-agent-provider.js";
import {
  ClaudeCliNotFoundError,
  resolveClaudeCliPath,
  runClaudeCli,
  systemLookupEnv,
  type ClaudeCliMessage,
  type ClaudeCliOptions,
  type ClaudeCliSystemInit,
  type ClaudeQueryFn
} from "../../src/providers/claude-cli.js";
import { generateStructured } from "../../src/providers/structured-output.js";
import type {
  Message,
  ProviderSession,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "../../src/providers/types.js";

const LIVE = process.env.NODETOOL_CLAUDE_CLI_E2E === "1";
const MODEL = process.env.NODETOOL_CLAUDE_CLI_E2E_MODEL || "haiku";
const TIMEOUT = 240_000;

type ChunkItem = Extract<ProviderStreamItem, { type: "chunk" }>;
type MessageItem = Extract<ProviderStreamItem, { type: "message" }>;
type SessionItem = Extract<ProviderStreamItem, { type: "session" }>;

/** One recorded CLI session: what the provider asked for and what came back. */
interface Recorded {
  options: ClaudeCliOptions;
  messages: ClaudeCliMessage[];
}

let cliPath = "";
let redPng = "";

/**
 * A provider whose sessions run the real CLI and are recorded, so a test can
 * read the CLI's own `init` report (tools, MCP servers, skills).
 */
function recordingProvider(): { provider: ClaudeAgentProvider; sessions: Recorded[] } {
  const sessions: Recorded[] = [];
  const queryFn: ClaudeQueryFn = (params) =>
    (async function* () {
      const record: Recorded = { options: params.options, messages: [] };
      sessions.push(record);
      for await (const message of runClaudeCli({ cliPath, ...params })) {
        record.messages.push(message);
        yield message;
      }
    })();
  return { provider: new ClaudeAgentProvider({}, { queryFn }), sessions };
}

function initOf(session: Recorded): ClaudeCliSystemInit {
  const init = session.messages.find(
    (m): m is ClaudeCliSystemInit => m.type === "system" && m.subtype === "init"
  );
  if (!init) throw new Error("The CLI reported no init message");
  return init;
}

async function collect(stream: AsyncGenerator<ProviderStreamItem>): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

const chunks = (items: ProviderStreamItem[]) =>
  items.filter((i): i is ChunkItem => "type" in i && i.type === "chunk");
const textOf = (items: ProviderStreamItem[]) =>
  chunks(items)
    .filter((c) => !c.thinking)
    .map((c) => c.content)
    .join("");
const messagesOf = (items: ProviderStreamItem[]) =>
  items.filter((i): i is MessageItem => "type" in i && i.type === "message").map((i) => i.message);
const toolCallsOf = (items: ProviderStreamItem[]) =>
  items.filter((i): i is ToolCall => "args" in i);
const user = (text: string): Message => ({ role: "user", content: text });
const system = (text: string): Message => ({ role: "system", content: text });

const addTool: ProviderTool = {
  name: "add_numbers",
  description: "Add two integers and return the sum. Always use this for arithmetic.",
  inputSchema: {
    type: "object",
    properties: { a: { type: "integer" }, b: { type: "integer" } },
    required: ["a", "b"]
  }
};

describe.skipIf(!LIVE)("ClaudeAgentProvider end to end (real Claude Code CLI)", () => {
  let workspace = "";

  beforeAll(async () => {
    cliPath = await resolveClaudeCliPath(process.env.CLAUDE_CLI_PATH, await systemLookupEnv());
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } }
    })
      .png()
      .toBuffer();
    redPng = png.toString("base64");
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "claude-cli-e2e-"));
    await fs.writeFile(path.join(workspace, "note.txt"), "The vault code is KESTREL-9031.\n");
  });

  afterAll(async () => {
    if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Finding the CLI
  // -------------------------------------------------------------------------

  it("auto-detects the CLI and answers with the system prompt applied", async () => {
    // No injected runner: this is the production path end to end.
    const provider = new ClaudeAgentProvider();
    const items = await collect(
      provider.generateMessages({
        messages: [
          system("You are a terse assistant. End every answer with the word BANANA."),
          user("Say hello.")
        ],
        model: MODEL,
        threadId: "e2e-system"
      })
    );
    expect(textOf(items)).toMatch(/BANANA/);
    expect(chunks(items).filter((c) => c.done)).toHaveLength(1);
    const session = items.find((i): i is SessionItem => "type" in i && i.type === "session");
    expect(session?.session.token).toMatch(/[0-9a-f-]{36}/);
    // Usage from the CLI's result is tracked (the cost needs a catalog price).
    expect(provider.usageTotals.inputTokens).toBeGreaterThan(0);
    expect(provider.usageTotals.outputTokens).toBeGreaterThan(0);
  }, TIMEOUT);

  it("uses CLAUDE_CLI_PATH when set and rejects one that does not exist", async () => {
    const pinned = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: cliPath });
    await expect(pinned.resolveCliPath()).resolves.toBe(cliPath);
    const reply = await pinned.generateMessage({ messages: [user("Reply with the single word: pong")], model: MODEL });
    expect(String(reply.content).toLowerCase()).toContain("pong");

    const broken = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: path.join(os.tmpdir(), "no-claude-here") });
    await expect(broken.generateMessage({ messages: [user("hi")], model: MODEL })).rejects.toThrow(ClaudeCliNotFoundError);
  }, TIMEOUT);

  // -------------------------------------------------------------------------
  // Single-turn primitive
  // -------------------------------------------------------------------------

  it("runs the tool-free primitive with every built-in tool and connector removed", async () => {
    const { provider, sessions } = recordingProvider();
    await collect(
      provider.generateMessages({
        messages: [user("Run the shell command `echo pwned` using the Bash tool, then tell me its output.")],
        model: MODEL
      })
    );
    const init = initOf(sessions[0]);
    expect(init.tools).toEqual([]);
    expect(init.mcp_servers).toEqual([]);
    const toolUses = sessions[0].messages.flatMap((m) =>
      m.type === "assistant" ? (m.message?.content ?? []).filter((b) => b.type === "tool_use") : []
    );
    expect(toolUses).toEqual([]);
  }, TIMEOUT);

  it("streams thinking separately from text and passes effort", async () => {
    const { provider, sessions } = recordingProvider();
    const items = await collect(
      provider.generateMessages({
        messages: [user("What is 17 * 23? Think it through, then answer with just the number.")],
        model: MODEL,
        effort: "low",
        thinking: { type: "manual", budgetTokens: 2048 }
      })
    );
    expect(sessions[0].options.effort).toBe("low");
    expect(sessions[0].options.thinking).toEqual({ type: "enabled", budgetTokens: 2048 });
    expect(textOf(items)).toContain("391");
  }, TIMEOUT);

  it("returns schema-valid structured output through the result-tool contract", async () => {
    const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: cliPath });
    const result = await generateStructured(provider, {
      messages: [user("Give the capital of France and its country code.")],
      model: MODEL,
      toolName: "capital",
      toolDescription: "Submit the capital",
      schema: {
        type: "object",
        properties: {
          city: { type: "string" },
          country_code: { type: "string", enum: ["FR", "DE", "IT"] }
        },
        required: ["city", "country_code"],
        additionalProperties: false
      }
    });
    expect(result).toEqual({ city: "Paris", country_code: "FR" });
  }, TIMEOUT);

  it("sends inline images as real image blocks", async () => {
    const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: cliPath });
    const reply = await provider.generateMessage({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What single color fills this image? Answer with one lowercase word." },
            { type: "image_url", image: { data: redPng, mimeType: "image/png" } }
          ]
        }
      ]
    });
    expect(String(reply.content).toLowerCase()).toContain("red");
  }, TIMEOUT);

  it("resumes a thread's CLI session with only the new user turn", async () => {
    const { provider, sessions } = recordingProvider();
    const first = [user("Remember this codeword: PELICAN-42. Reply only with OK.")];
    const turn1 = await collect(provider.generateMessages({ messages: first, model: MODEL, threadId: "e2e-resume" }));
    const session = turn1.find((i): i is SessionItem => "type" in i && i.type === "session")?.session as ProviderSession;
    expect(session.checkpoint).toBe(1);

    const second = [...first, { role: "assistant", content: textOf(turn1) } as Message, user("What was the codeword?")];
    const turn2 = await collect(provider.generateMessages({ messages: second, model: MODEL, threadId: "e2e-resume" }));
    expect(sessions[1].options.resume).toBe(session.token);
    expect(sessions[1].messages.length).toBeGreaterThan(0);
    expect(textOf(turn2)).toContain("PELICAN-42");

    // A fresh process resumes from the persisted token alone.
    const { provider: cold, sessions: coldSessions } = recordingProvider();
    const third = [...second, { role: "assistant", content: textOf(turn2) } as Message, user("Repeat the codeword once more.")];
    const turn3 = await collect(cold.generateMessages({ messages: third, model: MODEL, threadId: "e2e-resume", providerSession: session }));
    expect(coldSessions[0].options.resume).toBe(session.token);
    expect(textOf(turn3)).toContain("PELICAN-42");
  }, TIMEOUT);

  it("stops the CLI when the caller aborts", async () => {
    const provider = new ClaudeAgentProvider({ CLAUDE_CLI_PATH: cliPath });
    const controller = new AbortController();
    const seen: ProviderStreamItem[] = [];
    for await (const item of provider.generateMessages({
      messages: [user("Count from 1 to 400, one number per line.")],
      model: MODEL,
      signal: controller.signal
    })) {
      seen.push(item);
      if ("type" in item && item.type === "chunk" && item.content) controller.abort();
    }
    expect(chunks(seen).some((c) => c.done)).toBe(false);
  }, TIMEOUT);

  // -------------------------------------------------------------------------
  // Agent loop and tools
  // -------------------------------------------------------------------------

  it("runs NodeTool tools in the CLI loop through the host-served MCP server", async () => {
    const { provider, sessions } = recordingProvider();
    const executed: ToolCall[] = [];
    const items = await collect(
      provider.generateLoop({
        messages: [system("Use the add_numbers tool for all arithmetic."), user("What is 1234 + 4321?")],
        model: MODEL,
        tools: [addTool],
        executeTool: async (call) => {
          executed.push(call);
          return String(Number(call.args.a) + Number(call.args.b));
        }
      })
    );
    const init = initOf(sessions[0]);
    expect(init.tools).toContain("mcp__nodetool_tools__add_numbers");
    // Offering tools keeps the web pair live; everything else stays out.
    expect(init.tools).toEqual(expect.arrayContaining(["WebSearch", "WebFetch"]));
    expect(init.tools).not.toContain("Bash");
    expect(init.mcp_servers).toEqual([expect.objectContaining({ name: "nodetool_tools", status: "connected" })]);

    expect(executed).toHaveLength(1);
    expect(executed[0].args).toEqual({ a: 1234, b: 4321 });
    expect(toolCallsOf(items)[0]).toMatchObject({ name: "add_numbers", args: { a: 1234, b: 4321 } });
    const msgs = messagesOf(items);
    const assistantWithCall = msgs.find((m) => m.role === "assistant" && (m.toolCalls?.length ?? 0) > 0);
    const toolResult = msgs.find((m) => m.role === "tool");
    expect(assistantWithCall?.toolCalls?.[0].id).toBe(toolResult?.toolCallId);
    expect(toolResult?.content).toBe("5555");
    expect(textOf(items).replace(/,/g, "")).toContain("5555");
    expect(msgs.at(-1)?.role).toBe("assistant");
  }, TIMEOUT);

  it("dispatches a tool's own execute and ends the loop on a terminal tool", async () => {
    const { provider } = recordingProvider();
    const calls: Array<{ args: Record<string, unknown>; id: string }> = [];
    const items = await collect(
      provider.generateLoop({
        messages: [user("Call finish_step with summary set to 'done'. Do nothing else.")],
        model: MODEL,
        tools: [
          {
            name: "finish_step",
            description: "Report the step as finished.",
            inputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
            terminal: true,
            execute: async (args, id) => {
              calls.push({ args, id });
              return "recorded";
            }
          }
        ]
      })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ summary: "done" });
    expect(calls[0].id).toMatch(/^call_finish_step_/);
    expect(toolCallsOf(items).map((c) => c.name)).toEqual(["finish_step"]);
  }, TIMEOUT);

  it("returns image tool results to the model as pixels", async () => {
    const { provider } = recordingProvider();
    const items = await collect(
      provider.generateLoop({
        messages: [user("Call view_image, then tell me the single color that fills the image in one lowercase word.")],
        model: MODEL,
        tools: [{ name: "view_image", description: "Show the image under review.", inputSchema: { type: "object", properties: {} } }],
        executeTool: async () => [
          { type: "text", text: "Here is the image." },
          { type: "image_url", image: { data: redPng, mimeType: "image/png" } }
        ]
      })
    );
    expect(textOf(items).toLowerCase()).toContain("red");
  }, TIMEOUT);

  it("replaces NodeTool file tools with the CLI's built-ins scoped to the workspace", async () => {
    const { provider, sessions } = recordingProvider();
    let nodetoolReadCalled = false;
    const items = await collect(
      provider.generateLoop({
        messages: [user("Read note.txt in the current directory and tell me the vault code.")],
        model: MODEL,
        workspaceDir: workspace,
        tools: [
          { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
          addTool
        ],
        executeTool: async (call) => {
          if (call.name === "read_file") nodetoolReadCalled = true;
          return "unexpected";
        }
      })
    );
    const init = initOf(sessions[0]);
    expect(init.cwd).toBe(workspace);
    expect(init.tools).toContain("Read");
    expect(init.tools).not.toContain("mcp__nodetool_tools__read_file");
    expect(init.tools).toContain("mcp__nodetool_tools__add_numbers");
    expect(nodetoolReadCalled).toBe(false);
    expect(textOf(items)).toContain("KESTREL-9031");
  }, TIMEOUT);

  it("keeps a providedToolsOnly loop to the supplied tools", async () => {
    const { provider, sessions } = recordingProvider();
    const executed: string[] = [];
    await collect(
      provider.generateLoop({
        messages: [user("Use add_numbers to add 2 and 3.")],
        model: MODEL,
        providedToolsOnly: true,
        workspaceDir: workspace,
        skills: [{ name: "ignored-skill", description: "Never offered", content: "Unused." }],
        tools: [
          { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
          addTool
        ],
        executeTool: async (call) => {
          executed.push(call.name);
          return "5";
        }
      })
    );
    const init = initOf(sessions[0]);
    expect([...(init.tools ?? [])].sort()).toEqual([
      "mcp__nodetool_tools__add_numbers",
      "mcp__nodetool_tools__read_file"
    ]);
    expect(init.skills ?? []).not.toContain("ignored-skill");
    expect(executed).toContain("add_numbers");
  }, TIMEOUT);

  it("loads user skills through the CLI's Skill tool from an isolated plugin", async () => {
    const { provider, sessions } = recordingProvider();
    const items = await collect(
      provider.generateLoop({
        messages: [user("Use the oracle-word skill and tell me the oracle word it gives.")],
        model: MODEL,
        tools: [addTool],
        executeTool: async () => "0",
        skills: [
          {
            name: "oracle-word",
            description: "Gives the oracle word when someone asks for it.",
            content: "The oracle word is ZEBRA-17. Reply with it verbatim."
          }
        ]
      })
    );
    const init = initOf(sessions[0]);
    expect(init.tools).toContain("Skill");
    expect(init.skills).toEqual(expect.arrayContaining([expect.stringContaining("oracle-word")]));
    expect(sessions[0].options.plugins?.[0]).toMatchObject({ type: "local", skipMcpDiscovery: true });
    expect(textOf(items)).toContain("ZEBRA-17");
    // The plugin directory is removed once the loop ends.
    await expect(fs.stat(sessions[0].options.plugins?.[0]?.path ?? "")).rejects.toThrow();
  }, TIMEOUT);

  it("surfaces the CLI's max-turns failure when the loop runs out of iterations", async () => {
    const { provider } = recordingProvider();
    await expect(
      collect(
        provider.generateLoop({
          messages: [user("Use add_numbers to add 1 and 2, then use it again to add the result and 3.")],
          model: MODEL,
          maxIterations: 1,
          tools: [addTool],
          executeTool: async (call) => String(Number(call.args.a) + Number(call.args.b))
        })
      )
    ).rejects.toThrow(/error_max_turns/);
  }, TIMEOUT);
});
