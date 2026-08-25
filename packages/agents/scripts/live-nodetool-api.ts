/**
 * Live harness for the `nodetool` object model: drives real code actions in
 * the QuickJS sandbox against a RUNNING NodeTool server's MCP endpoint, so
 * every `nodetool.*` call goes through the actual server-side tools (node
 * registry, DB, providers).
 *
 *   npx tsx packages/agents/scripts/live-nodetool-api.ts [use-case ...]
 *
 * Use cases: discover-build-run, rows-batch, example-inspect, media-pick.
 * No args runs all four. Needs the API server on :7777 (`npm run dev:server`).
 * `media-pick` spends real money (one image) only when a t2i provider is
 * configured; it reports and skips otherwise.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { discoverSandboxCatalog } from "@nodetool-ai/node-sdk";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { createHarnessContext } from "./harness-context.js";

const SERVER = process.env.NODETOOL_API_URL ?? "http://127.0.0.1:7777";

interface UseCase {
  name: string;
  code: string;
}

const CASES: UseCase[] = [
  {
    // 1. Discovery → DSL graph → validate → save → run. Deterministic text
    // pipeline: two chained Concat nodes fill a sentence.
    name: "discover-build-run",
    code: `
import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { concat } from "@nodetool-ai/sandbox-dsl/nodetool.text";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const hits = await nodetool.nodes.search("concatenate text");
const info = await nodetool.nodes.info("nodetool.text.Concat");

const name = stringInput({ name: "name" });
const city = stringInput({ name: "city" });
const lives = concat({ a: name.output(), b: " lives in " });
const sentence = concat({ a: lives.output(), b: city.output() });
const graph = workflow(
  output({ name: "sentence", value: sentence.output() })
);

const check = await nodetool.workflows.validate(graph);
if (check.issues && check.issues.length) return { invalid: check.issues };
const wf = await nodetool.workflows.create(
  "live-harness discover-build-run",
  graph
);
const result = await nodetool.workflows.run(wf.id, {
  name: "Ada",
  city: "London"
});
return {
  searchHits: hits.results ? hits.results.length : hits.length,
  infoOk: !!(info && (info.properties || info.title || info.node_type)),
  validation: check.status || check,
  workflowId: wf.id,
  output: result.results || result.outputs || result
};`
  },
  {
    // 2. Rows → batch: one saved workflow, run once per row. The workflow id
    // comes from the discover-build-run case via `__WF_ID__` below — there is
    // no cross-action variable bag, so the harness passes it explicitly.
    name: "rows-batch",
    code: `
const rows = [
  { product: "Lamp", price: "49" },
  { product: "Chair", price: "129" },
  { product: "Desk", price: "349" }
];
const wfId = "__WF_ID__";
if (!wfId) throw new Error("run discover-build-run first");
const runs = await nodetool.batch(rows, (row) =>
  nodetool.workflows.run(wfId, { name: row.product, city: "stock: " + row.price }),
  { concurrency: 2 });
return runs.map((r) => ({
  ok: r.ok,
  item: r.item.product,
  out: r.ok ? (r.value.results || r.value.outputs || r.value) : r.error
}));`
  },
  {
    // 3. Examples → inspect + revalidate.
    name: "example-inspect",
    code: `
const examples = await nodetool.workflows.list({ workflow_type: "example", limit: 50 });
const list = examples.workflows || examples;
const pick = list.find((w) => /getting|start|hello|text/i.test(w.name)) || list[0];
const full = await nodetool.workflows.example(
  (pick.package_name || "nodetool-base") + "/" + pick.name
);
const check = await nodetool.workflows.validate(full);
return {
  examplesListed: list.length,
  picked: pick.name,
  nodes: full.graph.nodes.length,
  edges: full.graph.edges.length,
  types: full.graph.nodes.map((n) => n.type).slice(0, 6),
  validation: check.status || check.error || check
};`
  },
  {
    // 4. Model catalog → pick → one cheap image (skips without a t2i provider).
    name: "media-pick",
    code: `
const catalog = await nodetool.models.list({ limit: 1000 });
const byProvider = {};
for (const m of (catalog.results || [])) {
  byProvider[m.provider] = (byProvider[m.provider] || 0) + 1;
}
const providers = Object.keys(byProvider).map(
  (p) => ({ provider: p, models: byProvider[p] })
);
let picked = null;
let image = null;
try {
  picked = await nodetool.models.pick("text_to_image", {
    model_hint: ["fal-ai/flux/schnell"]
  });
  image = await nodetool.media.generateImage(
    "a tiny red fox in snow, minimal flat illustration", picked);
} catch (e) {
  return { providers, skipped: e.message };
}
return {
  providers: Array.isArray(providers)
    ? providers.map((p) => p.provider + "(" + p.models + ")")
    : providers,
  picked: picked.provider + "/" + picked.model_id,
  image: { uri: image.asset_uri, file: image.output_file || null }
};`
  },
  {
    // 5. Asset round trip: generated asset → sandbox bytes → workspace →
    // zip → back out as a new asset. Needs the harness context.
    name: "asset-roundtrip",
    code: `
let picked;
try {
  picked = await nodetool.models.pick("text_to_image", {
    model_hint: ["fal-ai/flux/schnell"]
  });
} catch (e) {
  return { skipped: e.message };
}
const image = await nodetool.media.generateImage(
  "a single blue triangle on white, flat", picked);

await assetToSandbox(image.asset_uri, "in/generated.png");
const bytes = await workspace.readBytes("in/generated.png");

await workspace.writeBytes("out/bundle.png", bytes);
await workspace.write(
  "out/manifest.json",
  JSON.stringify({ source: image.asset_uri, bytes: bytes.length })
);
const ref = await sandboxToAsset("out/bundle.png");

return {
  sourceAsset: image.asset_uri,
  imageBytes: bytes.length,
  pngMagicOk: bytes[0] === 137 && bytes[1] === 80,
  newAsset: { id: ref.id || ref.asset_id || ref, type: ref.type || null }
};`
  }
];

async function main(): Promise<void> {
  const wanted = process.argv.slice(2);
  const cases = wanted.length
    ? CASES.filter((c) => wanted.includes(c.name))
    : CASES;

  const client = new Client({ name: "live-nodetool-api", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${SERVER}/mcp`)));
  const listed = await client.listTools();
  const tools = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema
  }));
  console.log(`connected: ${tools.length} tools from ${SERVER}/mcp`);

  // The graph cases author with `@nodetool-ai/sandbox-dsl`, so this harness
  // needs the same pack catalog a server builds at startup.
  const session = createChatCodeActSession({
    context: createHarnessContext(),
    sandboxModuleCatalog: discoverSandboxCatalog().catalog,
    tools,
    executeTool: async (call) => {
      const res = await client.callTool({
        name: call.name,
        arguments: call.args
      });
      const blocks = Array.isArray(res.content) ? res.content : [];
      const text = blocks
        .map((b) => (typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : ""))
        .filter(Boolean)
        .join("\n");
      if (res.isError) throw new Error(text || `tool ${call.name} failed`);
      return text;
    }
  });

  let failures = 0;
  let createdWfId = "";
  for (const useCase of cases) {
    console.log(`\n=== ${useCase.name} ===`);
    const started = Date.now();
    const code =
      useCase.name === "rows-batch"
        ? useCase.code.replace("__WF_ID__", createdWfId)
        : useCase.code;
    const observation = JSON.parse(
      await session.executeAction({ code })
    );
    const elapsed = Date.now() - started;
    if (observation.ok) {
      if (
        typeof observation.result?.workflowId === "string" &&
        !createdWfId
      ) {
        createdWfId = observation.result.workflowId;
      }
      console.log(`ok in ${elapsed}ms, ${observation.toolCalls} tool calls`);
      console.log(JSON.stringify(observation.result, null, 2));
    } else {
      failures++;
      console.log(`FAILED in ${elapsed}ms: ${observation.error}`);
      if (observation.logs) console.log(observation.logs.join("\n"));
    }
  }
  await client.close();
  if (failures > 0) {
    console.error(`\n${failures} use case(s) failed`);
    process.exit(1);
  }
  console.log("\nall use cases passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
