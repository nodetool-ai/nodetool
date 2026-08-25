/**
 * Five end-to-end scenarios for the CodeAct-only system: real QuickJS sandbox,
 * real server tools over MCP, in-process services behind them. Scenario 2 and
 * 5 spend real money on fal (one image each) when a fal key is configured.
 *
 *   npx tsx packages/agents/scripts/test-new-system.ts [scenario ...]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { discoverSandboxCatalog } from "@nodetool-ai/node-sdk";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { createHarnessContext } from "./harness-context.js";

const SERVER = process.env.NODETOOL_API_URL ?? "http://127.0.0.1:7777";

interface Scenario {
  name: string;
  what: string;
  code: string;
}

const SCENARIOS: Scenario[] = [
  {
    // In-process workflow lifecycle: discover nodes, build an ad-hoc graph,
    // validate, run, then read the job back through the models layer.
    name: "workflow-lifecycle",
    what: "discover → build → validate → run → job records, all in-process",
    code: `
import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { concat } from "@nodetool-ai/sandbox-dsl/nodetool.text";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const name = stringInput({ name: "name" });
const sentence = concat({ a: name.output(), b: " built this pipeline." });
const graph = workflow(
  output({ name: "sentence", value: sentence.output() })
);

const check = await nodetool.workflows.validate(graph);
if (check.issues && check.issues.length) return { failed: "validate", check };

const wf = await nodetool.workflows.create("scenario-1", graph);
const result = await nodetool.workflows.run(wf.id, { name: "CodeAct" });

const jobs = await nodetool.jobs.list({ workflow_id: wf.id, limit: 3 });
const job = jobs.jobs && jobs.jobs[0] ? await nodetool.jobs.get(jobs.jobs[0].id) : null;
return {
  sentence: result && (result.sentence ?? result),
  jobStatus: job && job.status,
  jobHasUri: !!(job && job.id)
};`
  },
  {
    // The original bug scenario, end to end: generate on fal, then "show me
    // the last asset image" — list newest, get, and the asset:// uri.
    name: "fal-media-asset",
    what: "fal image generation → asset library → asset:// uri (the original bug)",
    code: `
const model = await nodetool.models.pick("text_to_image", { provider: "fal_ai" });
if (!model) return { skipped: "no fal text_to_image model configured" };

const image = await nodetool.media.generateImage(
  "a tiny robot watering a bonsai tree, watercolor",
  model,
  { width: 512, height: 512 }
);

const uri = image && (image.asset_uri ?? image.uri ?? null);
const generatedId = uri ? uri.replace("asset://", "").split(".")[0] : null;

const images = await nodetool.assets.list({ content_type: "image", limit: 3 });
const newest = images.assets && images.assets[0];
const fetched = generatedId ? await nodetool.assets.get(generatedId) : null;
return {
  generated: uri,
  newestId: newest && newest.id,
  // The just-generated image must BE the newest asset in the library —
  // the original bug was generated assets invisible to the listing.
  newestIsGenerated: !!(newest && generatedId && newest.id === generatedId),
  getFindsGenerated: !!(fetched && !fetched.error)
};`
  },
  {
    // The namespaces added this branch. Backends without keys must degrade
    // to a named error, not a crash.
    name: "new-namespaces",
    what: "nodetool.web / memory / style wrappers, graceful degradation",
    code: `
const out = {};
try {
  const hits = await nodetool.web.search("nodetool visual ai workflows");
  out.webSearch = { ok: true, kind: typeof hits };
} catch (e) { out.webSearch = { ok: false, error: String(e.message).slice(0, 120) }; }

// Thread memories only exist inside a chat thread; over MCP the correct
// behavior is a named refusal, not a crash.
try {
  const saved = await nodetool.memory.save("Scenario test: watercolor robots.", { title: "test-preference" });
  const listed = await nodetool.memory.list();
  out.memory = {
    savedId: saved && (saved.id ?? saved.memory_id ?? null),
    count: listed && (listed.memories ? listed.memories.length : listed.count ?? null)
  };
  const id = saved && (saved.id ?? saved.memory_id);
  if (id) { await nodetool.memory.remove(id); out.memory.cleaned = true; }
} catch (e) {
  const msg = String(e.message);
  out.memory = {
    gracefulRefusal: msg.includes("thread"),
    error: msg.slice(0, 120)
  };
}

try {
  const profile = await nodetool.style.profile();
  out.style = { ok: true, type: typeof profile };
} catch (e) { out.style = { ok: false, error: String(e.message).slice(0, 120) }; }
return out;`
  },
  {
    // Headless document editing: edit ops against a real sequence, validate,
    // snapshot a version — no browser anywhere. TIMELINE_ID is interpolated
    // by the harness (a fresh sequence created over tRPC).
    name: "headless-timeline-edit",
    what: "nodetool.timelines.edit → validate → version history, no browser",
    code: `
const id = "__TIMELINE_ID__";
const edited = await nodetool.timelines.edit(id, [
  { op: "add_track", type: "audio", name: "Scenario Music" }
]);
if (edited && edited.error) return { failed: "edit", edited };

const check = await nodetool.timelines.validate(id);
const snap = await nodetool.timelines.snapshot(id, { name: "scenario snapshot" });
const versions = await nodetool.timelines.versions(id);
return {
  timelineId: id,
  editApplied: edited && (edited.applied ?? edited.ops_applied ?? true),
  validation: check && (check.ok ?? check.verdict ?? check.status ?? null),
  versionCount: versions && (versions.versions ? versions.versions.length : versions.count ?? null)
};`
  },
  {
    // A workflow that spends real money: fal TextToImage inside a graph, run
    // in-process, then debug_workflow on a deliberately broken graph to see
    // the failure path report properly.
    name: "complex-workflow-and-debug",
    what: "fal image node in a graph + debug report on a broken graph",
    code: `
const model = await nodetool.models.pick("text_to_image", { provider: "fal_ai" });
if (!model) return { skipped: "no fal model" };

import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { textToImage } from "@nodetool-ai/sandbox-dsl/nodetool.image";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const prompt = stringInput({ name: "prompt" });
const img = textToImage({
  prompt: prompt.output(),
  model: { type: "image_model", provider: model.provider, id: model.model_id }
});
const graph = workflow(output({ name: "image", value: img.output() }));

const check = await nodetool.workflows.validate(graph);
if (check.issues && check.issues.length) return { failed: "validate", issues: check.issues };

const wf = await nodetool.workflows.create("scenario-5 image", graph);
const result = await nodetool.workflows.run(wf.id, {
  prompt: "isometric pixel-art greenhouse at dusk"
});

// Broken graph → the debug report must carry the failure, not lose it.
const broken = await nodetool.workflows.create("scenario-5 broken", {
  nodes: [
    { id: "x", type: "nodetool.does.NotExist", data: {} },
    { id: "out", type: "nodetool.output.Output", data: { name: "y" } }
  ],
  edges: []
});
let debugReport = null;
if (broken && broken.id) {
  debugReport = await nodetool.workflows.debug(broken.id);
}
return {
  imageProduced: !!(result && (result.image ?? Object.keys(result).length)),
  runWorkflowId: wf.id,
  brokenCreateRefused: !(broken && broken.id),
  brokenError: broken && broken.error ? String(broken.error).slice(0, 140) : null,
  debugVerdict: debugReport && debugReport.run && (debugReport.run.verdict ?? debugReport.run.status ?? null)
};`
  }
];

async function main(): Promise<void> {
  const wanted = process.argv.slice(2);
  const scenarios = wanted.length
    ? SCENARIOS.filter((s) => wanted.includes(s.name))
    : SCENARIOS;

  const client = new Client({ name: "test-new-system", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${SERVER}/mcp`))
  );
  const listed = await client.listTools();
  const tools = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema
  }));
  console.log(`connected: ${tools.length} tools from ${SERVER}/mcp`);

  const session = createChatCodeActSession({
    context: createHarnessContext(),
    // The graph scenarios author with `@nodetool-ai/sandbox-dsl`.
    sandboxModuleCatalog: discoverSandboxCatalog().catalog,
    tools,
    executeTool: async (call) => {
      const res = await client.callTool({ name: call.name, arguments: call.args });
      const blocks = Array.isArray(res.content) ? res.content : [];
      const text = blocks
        .map((b) =>
          typeof (b as { text?: unknown }).text === "string"
            ? (b as { text: string }).text
            : ""
        )
        .filter(Boolean)
        .join("\n");
      if (res.isError) throw new Error(text || `tool ${call.name} failed`);
      return text;
    }
  });

  // Scenario 4 edits a real sequence — create a disposable one over tRPC so
  // no existing timeline is touched.
  let timelineId = "";
  try {
    const res = await fetch(`${SERVER}/trpc/timeline.create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "codeact scenario", projectId: "default" })
    });
    const body = (await res.json()) as {
      result?: { data?: { id?: string } };
    };
    timelineId = body.result?.data?.id ?? "";
  } catch {
    // Scenario 4 will report the failure itself.
  }
  console.log(`scenario timeline: ${timelineId || "(create failed)"}`);

  let failures = 0;
  for (const s of scenarios) {
    console.log(`\n=== ${s.name} — ${s.what} ===`);
    const started = Date.now();
    const code = s.code.replace("__TIMELINE_ID__", timelineId);
    const observation = JSON.parse(await session.executeAction({ code }));
    const elapsed = Date.now() - started;
    if (observation.ok) {
      console.log(`ok in ${elapsed}ms, ${observation.toolCalls} tool calls`);
      console.log(JSON.stringify(observation.result, null, 2));
    } else {
      failures++;
      console.log(`FAILED in ${elapsed}ms: ${observation.error}`);
      if (observation.logs?.length) console.log(observation.logs.join("\n"));
    }
  }
  await client.close();
  if (failures > 0) {
    console.error(`\n${failures} scenario(s) failed`);
    process.exit(1);
  }
  console.log("\nall scenarios passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
