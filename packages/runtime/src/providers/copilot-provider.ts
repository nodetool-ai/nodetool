/**
 * CopilotProvider: models reached through GitHub's Copilot CLI (`copilot`) on
 * the machine's signed-in Copilot account.
 *
 * There is no API key. `copilot` authenticates with credentials cached by an
 * earlier `copilot login`. Every turn runs on `copilot --acp`, the CLI's Agent
 * Client Protocol server, with the built-in GitHub MCP servers disabled. The CLI
 * runs its own agent loop. A turn that offers NodeTool tools serves them to the
 * CLI as an HTTP MCP server on a loopback port (see acp-session.ts), because
 * the CLI rejects stdio MCP servers from ACP clients. Anything else the CLI
 * asks permission for, such as its shell and file tools, is denied, and the CLI
 * runs in an empty scratch directory.
 *
 * A forced single tool (structured output) is offered as that tool and
 * captured from the call. Prompts must be text, and each turn starts a fresh
 * session primed with the history.
 */

import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS, isString } from "@nodetool-ai/protocol";
import {
  acpProcessSpawner,
  listAcpModels,
  runAcpTurn,
  type AcpSpawner,
  type AcpToolCallInfo
} from "./acp-session.js";
import {
  AcpCliProvider,
  buildFreshPrompt,
  extractSystemPrompt,
  scratchWorkspace
} from "./acp-cli-provider.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  isProviderStop,
  type LanguageModel,
  type Message,
  type ProviderStreamItem,
  type ProviderTool,
  type ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.copilot");

const INSTALL_HINT =
  "Install the GitHub Copilot CLI (`npm install -g @github/copilot`), then run `copilot login` to sign in.";

/** MCP server name. The CLI titles its tools `<server>-<tool>` when it first reports a call. */
const TOOL_SERVER = "nodetool";

export interface CopilotProviderOptions {
  /** Replaces the `copilot --acp` subprocess, for tests. */
  spawnAcp?: AcpSpawner;
}

export class CopilotProvider extends AcpCliProvider {
  static requiredSecrets(): string[] {
    // Auth lives in the CLI's own credential cache, not in a NodeTool secret.
    return [];
  }

  protected readonly spawnAcp: AcpSpawner;
  protected readonly cliName = "GitHub Copilot CLI";
  protected readonly cliLabel = "copilot";
  /**
   * `--deny-tool` wins over every allow rule and over the CLI's own silent
   * approval of "safe" commands, which never reach the ACP permission request.
   * Only NodeTool's MCP tools stay usable.
   */
  protected readonly acpArgs = [
    "--acp",
    "--disable-builtin-mcps",
    ...["shell", "write", "read", "url", "memory"].map((kind) => `--deny-tool=${kind}`)
  ];
  protected readonly scratchName = "nodetool-copilot";
  protected override acpTransport: "stdio" | "http" = "http";
  private modelsCache: Promise<LanguageModel[]> | null = null;

  constructor(_secrets: Record<string, unknown> = {}, options: CopilotProviderOptions = {}) {
    super(PROVIDER_IDS.COPILOT);
    this.spawnAcp =
      options.spawnAcp ??
      acpProcessSpawner({
        command: "copilot",
        args: this.acpArgs,
        notFound: `GitHub Copilot CLI (copilot) not found. ${INSTALL_HINT}`
      });
  }

  /** The CLI's credentials never leave this process. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /** Tools reach `copilot` through `generateLoop`, over its ACP server. */
  override async hasToolSupport(): Promise<boolean> {
    return true;
  }

  override async unavailableReason(): Promise<string | null> {
    try {
      await listAcpModels({ spawn: this.spawnAcp, cwd: null, label: this.cliLabel });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return /not found|sign-in|login/i.test(message)
        ? message
        : `The GitHub Copilot CLI is unavailable: ${message}. ${INSTALL_HINT}`;
    }
  }

  /**
   * The models the signed-in account offers, read from an ACP session. Empty
   * when the CLI is missing or signed out.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    this.modelsCache ??= listAcpModels({ spawn: this.spawnAcp, cwd: null, label: this.cliLabel })
      .then((models) =>
        models.map((m) => ({ id: m.id, name: m.name, provider: PROVIDER_IDS.COPILOT }))
      )
      .catch((err: Error) => {
        log.warn("Listing Copilot models failed", { error: err.message });
        this.modelsCache = null;
        return [];
      });
    return this.modelsCache;
  }

  /** The CLI titles an MCP tool `<server>-<tool>` before it asks permission. */
  protected override acpToolMatcher(
    tools: readonly ProviderTool[]
  ): (call: AcpToolCallInfo) => boolean {
    const titles = new Set(tools.map((t) => `${TOOL_SERVER}-${t.name}`));
    return (call) => call.firstTitle !== undefined && titles.has(call.firstTitle);
  }

  /** `auto` is the session's own default, so it is not selected explicitly. */
  protected override acpModelId(model: string): string {
    return model === "auto" ? "" : model;
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    signal?: AbortSignal;
    loadFullHistory?: () => Promise<Message[]>;
  }): AsyncGenerator<ProviderStreamItem> {
    if (args.signal?.aborted) return;
    // A single forced tool is how callers ask for structured output. The CLI
    // has no schema flag, so the tool is offered and its call is the result.
    const tools = args.tools ?? [];
    const resultTool =
      tools.length === 1 && args.toolChoice === tools[0].name ? tools[0] : undefined;
    const history = args.loadFullHistory ? await args.loadFullHistory() : args.messages;
    const base = buildFreshPrompt(history, extractSystemPrompt(args.messages), this.cliName);
    const prompt = resultTool
      ? `${base}\n\nAnswer by calling the \`${resultTool.name}\` tool exactly once with your result. Do not reply in text.`
      : base;
    this.recordRequestPayload({ args: this.acpArgs, prompt });

    let captured: Record<string, unknown> | null = null;
    let streamed = false;
    for await (const event of runAcpTurn({
      spawn: this.spawnAcp,
      transport: "http",
      label: this.cliLabel,
      isOwnTool: resultTool ? this.acpToolMatcher([resultTool]) : undefined,
      cwd: await scratchWorkspace(this.scratchName),
      model: this.acpModelId(args.model),
      prompt,
      tools: resultTool ? [resultTool] : [],
      executeTool: async (_id, _name, given) => {
        captured = given;
        return { text: "Recorded. Do not add anything else.", isError: false };
      },
      signal: args.signal
    })) {
      if (event.type === "text") {
        if (resultTool) continue;
        streamed = true;
        yield { type: "chunk", content: event.text, done: false };
      } else if (event.type === "done") {
        if (event.usage) this.trackUsage(args.model, event.usage);
      }
    }
    if (args.signal?.aborted) return;
    if (resultTool) {
      if (!captured) {
        throw new Error(`Copilot did not call the ${resultTool.name} tool.`);
      }
      yield { id: `result_${globalThis.crypto.randomUUID()}`, name: resultTool.name, args: captured };
    } else if (!streamed) {
      log.debug("Copilot returned no text for the turn");
    }
    yield { type: "chunk", content: "", done: true };
  }

  override async generateMessage(args: Parameters<CopilotProvider["generateMessages"]>[0]): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if (isProviderSessionUpdate(item) || isProviderMessageEvent(item) || isProviderStop(item)) {
        continue;
      }
      if ("args" in item) {
        toolCalls.push(item);
      } else if (!item.thinking && isString(item.content)) {
        content += item.content;
      }
    }
    return {
      role: "assistant",
      content: content || null,
      toolCalls: toolCalls.length ? toolCalls : null
    };
  }
}
