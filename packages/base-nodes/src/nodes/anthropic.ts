/**
 * Anthropic Claude Agent node.
 * Uses the Claude Agent SDK to run Claude with tool-use capabilities.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";

export class ClaudeAgentNode extends BaseNode {
  static readonly nodeType = "anthropic.agents.ClaudeAgent";
  static readonly title = "Claude Agent";
  static readonly description =
    "Run Claude as an agent in a sandboxed environment with tool use capabilities.\n    claude, agent, ai, anthropic, sandbox, assistant\n\n    Uses the Claude Agent SDK to run Claude with access to tools in a secure sandbox.\n    The agent can execute commands, read/write files, and use various tools while\n    maintaining security through sandbox isolation.\n\n    Use cases:\n    - Automated coding and debugging tasks\n    - File manipulation and analysis\n    - Complex multi-step workflows\n    - Research and data gathering";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
  static readonly requiredSettings = ["ANTHROPIC_API_KEY"];

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The task or question for the Claude agent to work on."
  })
  declare prompt: any;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The Claude compatible model to use for the agent."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "System Prompt",
    description: "Optional system prompt to guide the agent's behavior."
  })
  declare system_prompt: any;

  @prop({
    type: "int",
    default: 20,
    title: "Max Turns",
    description: "Maximum number of turns the agent can take.",
    min: 1,
    max: 100
  })
  declare max_turns: any;

  @prop({
    type: "list[str]",
    default: ["Read", "Write", "Bash"],
    title: "Allowed Tools",
    description:
      "List of tools the agent is allowed to use (e.g., 'Read', 'Write', 'Bash')."
  })
  declare allowed_tools: any;

  @prop({
    type: "enum",
    default: "acceptEdits",
    title: "Permission Mode",
    description: "Permission mode for tool usage.",
    values: ["default", "acceptEdits", "plan", "bypassPermissions"]
  })
  declare permission_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const apiKey =
      this._secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const model = (this.model ?? {}) as Record<string, unknown>;
    const modelId = String(model.id || "claude-sonnet-4-20250514");
    const systemPrompt = String(this.system_prompt ?? "");
    const maxTurns = Number(this.max_turns ?? 20);
    const permissionMode = String(this.permission_mode ?? "acceptEdits");
    const allowedTools = (this.allowed_tools ?? [
      "Read",
      "Write",
      "Bash"
    ]) as string[];

    // Use Claude Agent SDK via dynamic import
    // The SDK provides query() async iterator for streaming agent responses
    try {
      const sdk = await import("claude-agent-sdk" as string);
      const { query } = sdk;

      const options = {
        model: modelId,
        system_prompt: systemPrompt || undefined,
        max_turns: maxTurns,
        allowed_tools: allowedTools,
        permission_mode: permissionMode,
        env: { ANTHROPIC_API_KEY: apiKey }
      };

      let fullText = "";
      for await (const message of query({ prompt, options })) {
        if (message?.content) {
          for (const content of message.content) {
            if (content?.text) {
              fullText += content.text;
            }
          }
        }
      }

      return { text: fullText };
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message?.includes("Cannot find module")) {
        throw new Error(
          "Claude Agent SDK (claude-agent-sdk) is not installed. " +
            "Install it to use the ClaudeAgent node.",
          { cause: e }
        );
      }
      throw new Error(`Claude Agent error: ${err.message}`, { cause: e });
    }
  }
}

export const ANTHROPIC_NODES: readonly NodeClass[] = [ClaudeAgentNode];
