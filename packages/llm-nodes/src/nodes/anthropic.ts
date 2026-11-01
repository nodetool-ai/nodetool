import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { runNativeWebSearch, type WebSearchOutputs } from "./native-web-search.js";
import {
  modelIdOf,
  providerModelProp,
  type ModelFieldValue
} from "./provider-model-prop.js";

/**
 * Nodes for Claude's own capabilities, one namespace per way of paying:
 * `anthropic` runs on an Anthropic API key, `claude_code` on a Claude Pro or
 * Max subscription through the Claude Code CLI. Plain text generation lives in
 * the generic Agent and Generate nodes, which take either provider's models.
 */

const WEB_SEARCH_OUTPUTS = { text: "str", sources: "list" };

export class AnthropicWebSearchNode extends BaseNode {
  static readonly nodeType = "anthropic.text.WebSearch";
  static readonly body = "content_card";
  static readonly primaryOutput = "text";
  static readonly title = "Web Search";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["query"];
  static readonly description =
    "Answer a query from current web pages with Claude and Anthropic's built-in web search, on your Anthropic API key.\n    anthropic, claude, web, search, internet, current, sources";
  static readonly metadataOutputTypes = WEB_SEARCH_OUTPUTS;
  static readonly requiredSettings = ["ANTHROPIC_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The question to research on the web."
  })
  declare query: string;

  @providerModelProp(
    "language_model",
    PROVIDER_IDS.ANTHROPIC,
    "claude-sonnet-5-5",
    "The Claude model that searches and writes the answer."
  )
  declare model: ModelFieldValue;

  async process(context?: ProcessingContext): Promise<WebSearchOutputs> {
    return runNativeWebSearch(context, PROVIDER_IDS.ANTHROPIC, modelIdOf(this.model), this.query);
  }
}

export class ClaudeCodeWebSearchNode extends BaseNode {
  static readonly nodeType = "claude_code.text.WebSearch";
  static readonly body = "content_card";
  static readonly primaryOutput = "text";
  static readonly title = "Web Search";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["query"];
  static readonly description =
    "Answer a query from current web pages with Claude Code's web search, on your Claude Pro or Max subscription.\n    claude code, claude, subscription, web, search, internet, current";
  static readonly metadataOutputTypes = WEB_SEARCH_OUTPUTS;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The question to research on the web."
  })
  declare query: string;

  @providerModelProp(
    "language_model",
    PROVIDER_IDS.CLAUDE_AGENT_SDK,
    "sonnet",
    "The Claude model that searches and writes the answer."
  )
  declare model: ModelFieldValue;

  async process(context?: ProcessingContext): Promise<WebSearchOutputs> {
    return runNativeWebSearch(context, PROVIDER_IDS.CLAUDE_AGENT_SDK, modelIdOf(this.model), this.query);
  }
}

export const ANTHROPIC_NODES = tagAsServer([AnthropicWebSearchNode]);
export const CLAUDE_CODE_NODES = tagAsServer([ClaudeCodeWebSearchNode]);
