/**
 * The short guest contract MCP clients are guaranteed to see.
 *
 * MCP has no system prompt. The full CodeAct catalog still rides in the
 * `execute_code` description; this block leads that description, is the
 * server `instructions` string, and is echoed on `nodetool://sandbox`.
 * Keep it short — many clients truncate a long tool description.
 */

import {
  getSandboxManifest,
  type SandboxManifest
} from "../code-gen/sandbox-manifest.js";
import { chatUnavailableBridges } from "./prompt.js";

/** Structured guest surface for MCP clients that read resources. */
export const MCP_SANDBOX_RESOURCE_URI = "nodetool://sandbox";

/**
 * A complete action that lists, picks a model, and generates one image.
 * Teaching example — do not run it in CI (pick/generate need a configured model).
 */
export const MCP_SANDBOX_ACTION_SNIPPET = `const listed = await nodetool.workflows.list();
const model = await nodetool.models.pick("text_to_image");
const image = await nodetool.media.generateImage("a red fox", model);
return { count: listed.workflows.length, uri: image.asset_uri };`;

/**
 * List one asset and fetch it as a ref. Pass the ref through.
 * Do not open it with fs or fetch. Runs against an empty library.
 */
export const MCP_SANDBOX_ASSET_SNIPPET = `const listed = await nodetool.assets.list({ limit: 1 });
const row = listed.assets[0];
if (!row) return { found: 0 };
const asset = await nodetool.assets.get(row.id);
return { id: asset.id, uri: asset.uri };`;

/**
 * Cheap probe: list workflows and look up a deferred tool.
 * Safe to run in tests — no model, no spend.
 */
export const MCP_SANDBOX_PROBE_SNIPPET = `const listed = await nodetool.workflows.list();
const hits = await nodetool.searchTools("validate_workflow");
return { count: listed.workflows.length, tools: hits.map((h) => h.name) };`;

/** Lead-in every MCP client is supposed to inject next to the system prompt. */
export const MCP_GUEST_CONTRACT = `# Guest JavaScript (not Node)

\`execute_code\` runs in a QuickJS guest. There is no Node and no host filesystem.
Do not use \`fs\`, \`require\`, \`process\`, \`Buffer\`, \`setTimeout\`, or \`eval\`.

Write one action:

\`\`\`js
${MCP_SANDBOX_ACTION_SNIPPET}
\`\`\`

Rules:
- Call \`nodetool.<namespace>.<method>()\`. Do not invent MCP tools. There is no \`tools.*\` global — anything the object model does not cover is a static \`import\` from \`@nodetool-ai/sandbox-nodetool/<namespace>\`.
- Unknown tool: \`await nodetool.searchTools("query")\` first. Each hit carries the \`import\` line to write. Do not guess arguments, and do not guess the module.
- Static \`import\` only for allowed packs. This session lists them below; anything else fails.
- \`return\` a small summary. Nothing carries over between actions except what a tool saved — generation results are already assets (\`asset://\`). Record anything a later action needs with \`nodetool.memory.save\`; the next action must reuse it, not generate again.
- A failed tool throws. Use \`try/catch\`.
- This is a chat turn: there is no \`finish()\`. A plain assistant message ends the turn.
- \`fetch\`, \`workspace\`, \`media\`, and \`getSecret\` are not available here. Files and assets go through \`nodetool.*\`: feed a generation result into \`image.*\`, save with \`nodetool.media.toImage(handle)\`. The guest holds handles, never encoded bytes. \`nodetool.assets.read/save\` the library, \`nodetool.web.fetch\` the network.
- Full guest surface: resource \`${MCP_SANDBOX_RESOURCE_URI}\`. Tool catalog: \`nodetool://capabilities\`.`;

export interface McpSandboxBridge {
  name: string;
  members: string[];
}

export interface McpSandboxCatalog {
  server: "nodetool";
  runtime: string;
  resource: typeof MCP_SANDBOX_RESOURCE_URI;
  contract: string;
  native_globals: readonly string[];
  blocked_globals: readonly string[];
  unavailable_bridges: readonly string[];
  available_bridges: McpSandboxBridge[];
  packages: readonly string[];
  examples: {
    action: string;
    asset: string;
    probe: string;
  };
}

export interface McpSandboxCatalogOptions {
  packageSpecifiers?: readonly string[];
  manifest?: SandboxManifest;
}

/** Machine-readable guest surface, derived from the sandbox manifest. */
export function buildMcpSandboxCatalog(
  options: McpSandboxCatalogOptions = {}
): McpSandboxCatalog {
  const manifest = options.manifest ?? getSandboxManifest();
  const unavailable = chatUnavailableBridges(manifest);
  const hidden = new Set(unavailable);
  const available_bridges: McpSandboxBridge[] = [];
  for (const bridge of Object.values(manifest.bridges)) {
    if (bridge.internal || bridge.members.length === 0) continue;
    if (hidden.has(bridge.name)) continue;
    available_bridges.push({
      name: bridge.name,
      members: bridge.members.map((member) => member.signature)
    });
  }
  return {
    server: "nodetool",
    runtime: manifest.runtime,
    resource: MCP_SANDBOX_RESOURCE_URI,
    contract: MCP_GUEST_CONTRACT,
    native_globals: manifest.nativeGlobals,
    blocked_globals: manifest.blockedGlobals,
    unavailable_bridges: unavailable,
    available_bridges,
    packages: options.packageSpecifiers ?? [],
    examples: {
      action: MCP_SANDBOX_ACTION_SNIPPET,
      asset: MCP_SANDBOX_ASSET_SNIPPET,
      probe: MCP_SANDBOX_PROBE_SNIPPET
    }
  };
}

export const MCP_SANDBOX_PROMPTS = [
  {
    name: "sandbox-action",
    title: "Sandbox action",
    description:
      "A complete execute_code body: list workflows, pick a model, generate one image.",
    snippet: MCP_SANDBOX_ACTION_SNIPPET
  },
  {
    name: "sandbox-asset",
    title: "Sandbox asset",
    description:
      "A complete execute_code body: list one asset and fetch the ref. Do not open bytes with fs.",
    snippet: MCP_SANDBOX_ASSET_SNIPPET
  }
] as const;
