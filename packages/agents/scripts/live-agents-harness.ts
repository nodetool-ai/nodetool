/**
 * Live harness for `nodetool.agents` and `nodetool.nodes.run` — the two
 * namespaces backed by chat-runner tools that the /mcp mount cannot serve.
 * Builds the REAL pieces in-process: the CLI's single-node harness
 * (`runSingleNode`, full TS registry + kernel context) behind `run_node`, and
 * a real `RunSubtaskTool` (StepExecutor child, real provider) behind
 * `run_subtask`, then drives them through code actions in the QuickJS sandbox.
 *
 *   NODE_OPTIONS=--conditions=nodetool-dev npx tsx packages/agents/scripts/live-agents-harness.ts
 *
 * The sub-agent calls spend real (small) money on the cheapest configured
 * text provider.
 */
import type { BaseProvider } from "@nodetool-ai/runtime";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { createHarnessContext } from "./harness-context.js";
import { Tool } from "../src/tools/base-tool.js";
import { RunSubtaskTool } from "../src/tools/run-subtask-tool.js";
import { runSingleNode } from "../../cli/src/node/run-node.js";
import { createProviderStrict } from "../../cli/src/providers.js";

class HarnessRunNodeTool extends Tool {
  readonly name = "run_node";
  readonly description = "Run a single NodeTool node by type.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      node_type: { type: "string" as const },
      inputs: { type: "object" as const }
    },
    required: ["node_type"]
  };

  async process(
    _context: unknown,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return runSingleNode(String(params["node_type"] ?? ""), {
      props: (params["inputs"] ?? {}) as Record<string, unknown>
    });
  }
}

async function pickTextProvider(): Promise<{
  provider: BaseProvider;
  model: string;
}> {
  const candidates: Array<{ id: string; model: string }> = [
    { id: "aki", model: "gpt-oss-120b" },
    { id: "cerebras", model: "llama3.1-8b" }
  ];
  for (const c of candidates) {
    try {
      const provider = await createProviderStrict(c.id);
      const models = await provider.getAvailableLanguageModels();
      const model =
        models.find((m) => m.id === c.model)?.id ??
        models.find((m) => /mini|8b|small/i.test(m.id))?.id ??
        models[0]?.id ??
        c.model;
      return { provider, model };
    } catch {
      // try the next candidate
    }
  }
  throw new Error("No text provider configured (tried cerebras, aki).");
}

async function main(): Promise<void> {
  const context = createHarnessContext();
  const { provider, model } = await pickTextProvider();
  console.log(`sub-agent provider: ${provider.provider}/${model}`);

  const runNodeTool = new HarnessRunNodeTool();
  const forwarded: string[] = [];
  const subtaskTool = new RunSubtaskTool({
    provider,
    model,
    parentTools: () => [runNodeTool],
    forwardMessage: async (msg) => {
      forwarded.push((msg as { type: string }).type);
    }
  });
  const tools = [runNodeTool, subtaskTool];

  const session = createChatCodeActSession({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    })),
    executeTool: async (call) => {
      const tool = tools.find((t) => t.name === call.name);
      if (!tool) throw new Error(`Unknown tool ${call.name}`);
      return Tool.executeTool(tool, context, call.args);
    },
    context
  });

  const code = `
const slug = await nodetool.nodes.run("nodetool.text.Slugify", {
  text: "The NodeTool API: Agents & Harnesses!"
});

const one = await nodetool.agents.run(
  "What is the capital of France? Reply with ONLY the city name."
);

const many = await nodetool.agents.fanout([
  "What is the capital of Japan? Reply with ONLY the city name.",
  { prompt: "What is the capital of Italy? Reply with ONLY the city name.",
    description: "Italy capital" }
], { concurrency: 2 });

return {
  slug: { ok: slug.ok, out: slug.chunks },
  one,
  many: many.map((r) => ({ ok: r.ok, out: r.ok ? r.value : r.error }))
};`;

  const started = Date.now();
  const observation = JSON.parse(await session.executeAction({ code }));
  console.log(`\naction finished in ${Date.now() - started}ms`);
  console.log(JSON.stringify(observation, null, 2));
  console.log(`\nforwarded child events: ${forwarded.length}`);
  process.exit(observation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
