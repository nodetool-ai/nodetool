/**
 * Generate supervised fine-tuning data from graded product-chat runs.
 *
 *   # 1. list the tasks: the jobs, the tool-loop cases, and --generated N
 *   #    tasks from each family in src/finetune/task-families.ts
 *   npx tsx packages/websocket/scripts/finetune-data.ts tasks --generated 30
 *
 *   # 2. sample runs; resumable, appends one JSON line per run
 *   npx tsx packages/websocket/scripts/finetune-data.ts sample -p openrouter \
 *     --models z-ai/glm-5.3-flash --generated 30 --budget 10 \
 *     --manifest manifest.json --out data/traces.jsonl
 *
 *   # 3. keep the achieved runs as chat-template records
 *   npx tsx packages/websocket/scripts/finetune-data.ts export \
 *     --traces data/traces.jsonl --out data/sft.jsonl
 *
 *   # held-out loss: a teacher's achieved runs on the validation split
 *   npx tsx packages/websocket/scripts/finetune-data.ts export --split val \
 *     --traces data/val-traces.jsonl --out data/val-sft.jsonl
 *
 * Every run goes through the real chat turn (see src/chat-jtbd.ts), and the
 * trace is the wire-level request and reply. `-p ollama` (the default) runs
 * local models; `-p llamacpp` runs the llama-server at FINETUNE_LLAMA_CPP_URL;
 * `-p openrouter` runs a teacher, with its key in the file named by
 * FINETUNE_OPENROUTER_KEY_FILE. `--split val` runs the frozen validation split.
 * `--context-window 65536` samples under the student's serving window, so the
 * chat turn compacts where the student's would. Count the records that do not
 * fit with `train.py check --max-seq`.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { initTestDb } from "@nodetool-ai/models";
import { LlamaProvider, OllamaProvider, OpenRouterProvider, type BaseProvider } from "@nodetool-ai/runtime";
import { listCapabilitySpecs, type ErasedJob } from "@nodetool-ai/agents";
import { runChatJob, type ClientToolManifestEntry } from "../src/chat-jtbd.js";
import { capturingOllamaFetch, type WireExchange } from "../src/finetune/ollama-capture.js";
import { capturingOpenAIFetch } from "../src/finetune/openai-capture.js";
import { exportSft, splitCompactionRequests, traceSegments, type ChatTrace, type ChatTraceLine } from "../src/finetune/sft-export.js";
import { runnableSplit } from "../src/finetune/task-sets.js";
import { bootstrapNodeRegistry } from "../src/node-registry-setup.js";
import { getSandboxCatalog, refreshSandboxCatalog } from "../src/sandbox-catalog.js";
import {
  isHeldOut,
  manifestDrift,
  normalizeObjective,
  validationManifest,
  type ValidationEntry
} from "../src/finetune/validation.js";

const [command = "", ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    provider: { type: "string", short: "p", default: "ollama" },
    budget: { type: "string" },
    models: { type: "string" },
    out: { type: "string" },
    generated: { type: "string", default: "0" },
    samples: { type: "string" },
    temperature: { type: "string" },
    manifest: { type: "string" },
    traces: { type: "string" },
    tasks: { type: "string" },
    timeout: { type: "string" },
    "context-window": { type: "string" },
    split: { type: "string", default: "train" }
  }
});

const serverToolNames = new Set(listCapabilitySpecs().map((spec) => spec.name));

/** The frozen validation split, checked in so it cannot drift unnoticed. */
const VALIDATION_MANIFEST = new URL("./finetune-validation-set.json", import.meta.url);

/**
 * The sandbox packs every sampled and evaluated run sees. A session's package
 * allowlist comes from what the install's catalog serves, so a machine
 * without a built pack refuses its imports: teacher runs once had
 * `@nodetool-ai/sandbox-dsl` refused while the eval allowed it.
 */
const SANDBOX_PACKS_MANIFEST = new URL("./finetune-sandbox-packs.json", import.meta.url);

/** The pack names the loaded sandbox catalog serves, sorted. */
function servedSandboxPacks(): string[] {
  return [...new Set((getSandboxCatalog()?.summaries() ?? []).map((s) => s.packName))].sort();
}

/** Refuse to sample when this install serves other packs than the pinned set. */
async function assertSandboxPacksPinned(): Promise<void> {
  const pinned = JSON.parse(await readFile(SANDBOX_PACKS_MANIFEST, "utf8")) as string[];
  const served = servedSandboxPacks();
  const missing = pinned.filter((name) => !served.includes(name));
  const extra = served.filter((name) => !pinned.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `the sandbox catalog differs from ${SANDBOX_PACKS_MANIFEST.pathname}: ` +
        `missing ${missing.join(", ") || "none"}, extra ${extra.join(", ") || "none"}. ` +
        "Build the missing packs (npm run build:packages), or rewrite the pin with `packs` after a deliberate change."
    );
  }
}

const splitRunnable = () => runnableSplit(Number(values.generated));

/** The tasks of `--split` (train or val). Validation refuses a drifted split. */
async function allTasks(): Promise<ErasedJob[]> {
  const split = await splitRunnable();
  if (values.split === "train") return split.train;
  if (values.split !== "val") throw new Error(`--split must be train or val, not ${values.split}`);
  const frozen = JSON.parse(await readFile(VALIDATION_MANIFEST, "utf8")) as ValidationEntry[];
  const drift = manifestDrift(frozen, validationManifest(split.validation));
  if (drift.length > 0) {
    throw new Error(`the validation split no longer matches ${VALIDATION_MANIFEST.pathname}: ${drift.slice(0, 5).join(", ")}`);
  }
  return split.validation;
}

/**
 * Provider keys NodeTool's secret lookup reads from the environment. A run's
 * server tools (media generation, model search) resolve keys the same way,
 * so a key here lets the model under test spend real money: a sampled turn
 * once found an OpenRouter key and started paid video generations. Sampling
 * refuses to start while any of them is set.
 */
const SPENDING_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "FAL_API_KEY",
  "REPLICATE_API_TOKEN",
  "ELEVENLABS_API_KEY",
  "KIE_API_KEY",
  "HF_TOKEN"
];

/**
 * The model provider, with a capturing `fetch` when `sink` is given: local
 * Ollama models, or teacher models on OpenRouter. The OpenRouter key comes
 * from the file named by FINETUNE_OPENROUTER_KEY_FILE and goes only to the
 * teacher's provider, never into the environment the run's tools read.
 */
function buildProvider(sink?: () => WireExchange[]): BaseProvider {
  const exposed = SPENDING_KEYS.filter((name) => process.env[name]);
  if (exposed.length > 0) {
    throw new Error(`unset ${exposed.join(", ")}: the run's tools would spend with them`);
  }
  const temperature = values.temperature ? { temperature: Number(values.temperature) } : {};
  if (values.provider === "openrouter") {
    const keyFile = process.env.FINETUNE_OPENROUTER_KEY_FILE;
    const key = keyFile ? readFileSync(keyFile, "utf8").trim() : "";
    if (!key) throw new Error("FINETUNE_OPENROUTER_KEY_FILE must name a file holding the OpenRouter key");
    return new OpenRouterProvider(
      { OPENROUTER_API_KEY: key },
      sink ? { fetchFn: capturingOpenAIFetch(sink, temperature) } : {}
    );
  }
  if (values.provider === "llamacpp") {
    // One llama-server serves one model, so --models only labels the traces.
    const url = process.env.FINETUNE_LLAMA_CPP_URL;
    if (!url) throw new Error("FINETUNE_LLAMA_CPP_URL must name the llama-server, e.g. http://127.0.0.1:8081");
    return new LlamaProvider({ LLAMA_CPP_URL: url }, sink ? { fetchFn: capturingOpenAIFetch(sink, temperature) } : {});
  }
  if (values.provider !== "ollama") throw new Error(`unknown provider ${values.provider}`);
  return new OllamaProvider(
    { OLLAMA_API_URL: process.env.OLLAMA_API_URL ?? "http://localhost:11434" },
    sink ? { fetchFn: capturingOllamaFetch(sink, temperature) } : {}
  );
}

async function writeOut(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function cmdTasks(): Promise<void> {
  for (const job of await allTasks()) {
    console.log(`${job.id}\t${job.surfaces[0] ?? "-"}\t${job.objective.slice(0, 100).replace(/\s+/g, " ")}`);
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** Fail before the first run when the sandbox catalog is missing or empty. */
function assertSandboxCatalogLoaded(): void {
  const catalog = getSandboxCatalog();
  if (!catalog || catalog.summaries().length === 0) {
    throw new Error(
      "sample needs the sandbox module catalog before its first run: without it the system prompt differs from production and changes mid-shard"
    );
  }
}

async function cmdSample(): Promise<void> {
  if (!values.models || !values.out) throw new Error("sample needs --models a,b --out <file>");
  const tasks = new Map((await allTasks()).map((job) => [job.id, job]));
  const wantedTasks = values.tasks ? new Set(values.tasks.split(",")) : null;
  const samples = Number(values.samples ?? "1");
  const extraManifest = values.manifest
    ? (JSON.parse(await readFile(values.manifest, "utf8")) as ClientToolManifestEntry[])
    : [];
  const existing = await readJsonl<ChatTrace>(values.out);
  const done = new Set(existing.map((t) => `${t.model}|${t.taskId}|${t.sample}`));
  const requestedWindow = values["context-window"] ? Number(values["context-window"]) : null;
  const otherWindow = existing.find((t) => (t.contextWindow ?? null) !== requestedWindow);
  if (otherWindow) {
    // A resumed shard keeps one window, or its runs are not comparable.
    throw new Error(
      `${values.out} holds runs sampled with context window ${otherWindow.contextWindow ?? "default"}, ` +
        `not ${requestedWindow ?? "default"}. Resume with the same --context-window or start a new file.`
    );
  }
  let exchanges: WireExchange[] = [];
  const provider = buildProvider(() => exchanges);
  const contextWindow = values["context-window"] ? Number(values["context-window"]) : null;
  if (contextWindow !== null) {
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
      throw new Error(`--context-window must be a positive token count, not ${values["context-window"]}`);
    }
    // The chat turn sizes compaction from the provider's window. The student's
    // llama-server window (serve-local.sh) is the one its sessions will have.
    provider.getContextWindow = async () => contextWindow;
  }
  // The product's node catalog, so search_nodes and validate_workflow answer
  // as they do in a real session. Installed third-party packs stay out.
  const nodeRegistry = await bootstrapNodeRegistry({ loadPacks: false });
  // `loadPacks: false` builds no sandbox module catalog, and the first workflow
  // REST call would build one mid-shard, changing the system prompt between
  // runs (53,309 then 61,088 characters). The server builds it at start, so the
  // harness does too, before the first run.
  await refreshSandboxCatalog();
  assertSandboxCatalogLoaded();
  await assertSandboxPacksPinned();
  await mkdir(dirname(values.out), { recursive: true });
  // A paid teacher stops at --budget (USD), counting the runs already in --out.
  const budget = values.budget ? Number(values.budget) : Infinity;
  let spent = (await readJsonl<ChatTrace>(values.out))
    .reduce(
      (sum, t) => sum + (t.compactionCostUsd ?? 0) + t.replies.reduce((s, r) => s + (r.costUsd ?? 0), 0),
      0
    );

  for (const model of values.models.split(",")) {
    for (let sample = 0; sample < samples; sample++) {
      for (const job of tasks.values()) {
        if (wantedTasks && !wantedTasks.has(job.id)) continue;
        const key = `${model}|${job.id}|${sample}`;
        if (done.has(key)) continue;
        if (spent >= budget) {
          console.log(`budget reached: $${spent.toFixed(2)} of $${budget}`);
          return;
        }
        exchanges = [];
        const report = await runChatJob(job, {
          provider,
          model,
          extraManifest,
          serverToolNames,
          nodeRegistry,
          timeoutMs: Number(values.timeout ?? 20 * 60_000)
        });
        // A compaction's summarizer call is captured too. It costs, but it is
        // not a step of the run, so it stays out of the replies and segments.
        const { chat, summaryCostUsd } = splitCompactionRequests(exchanges);
        const last = chat.at(-1);
        const segments = traceSegments(chat);
        const trace: ChatTraceLine = {
          taskId: job.id,
          objective: job.objective,
          model,
          sample,
          think: values.provider === "ollama" ? (process.env.OLLAMA_THINK ?? null) : null,
          achieved: report.achieved,
          completed: report.completed,
          outcomes: report.outcomes.map((o) => ({ name: o.name, passed: o.passed })),
          toolCallCount: report.toolCalls.length,
          durationMs: report.durationMs,
          ...(report.error ? { error: report.error } : {}),
          replies: chat.map((x) => ({
            reply: x.reply,
            doneReason: x.doneReason,
            promptTokens: x.promptTokens,
            evalTokens: x.evalTokens,
            status: x.status,
            costUsd: x.costUsd ?? null,
            messageCount: x.messages.length
          })),
          finalRequest: last ? { messages: last.messages, tools: last.tools } : null,
          ...(segments.length > 0 ? { segments } : {}),
          ...(summaryCostUsd > 0 ? { compactionCostUsd: summaryCostUsd } : {}),
          contextWindow,
          ...report.behaviour
        };
        await appendFile(values.out, `${JSON.stringify(trace)}\n`);
        done.add(key);
        const cost = exchanges.reduce((sum, x) => sum + (x.costUsd ?? 0), 0);
        spent += cost;
        const prompt = chat.map((x) => x.promptTokens ?? 0);
        console.log(
          `${report.achieved ? "PASS" : "FAIL"} ${model} ${key.split("|").slice(1).join(" ")} ` +
            `${Math.round(report.durationMs / 1000)}s requests=${chat.length} calls=${report.toolCalls.length} ` +
            `maxPrompt=${Math.max(0, ...prompt)} stops=${chat.map((x) => x.doneReason ?? "?").join(",")}` +
            `${cost > 0 ? ` cost=$${cost.toFixed(4)} total=$${spent.toFixed(2)}` : ""}` +
            ` repeated=${report.behaviour.repeatedCalls} refErrors=${report.behaviour.referenceErrors}` +
            ` importErrors=${report.behaviour.importErrors} unknownOps=${report.behaviour.unknownOps}` +
            ` revConflicts=${report.behaviour.revisionConflicts}` +
            `${report.error ? ` error=${report.error}` : ""}`
        );
      }
    }
  }
}

/** Write the packs this install's sandbox catalog serves as the pinned set. */
async function cmdPacks(): Promise<void> {
  await bootstrapNodeRegistry({ loadPacks: false });
  await refreshSandboxCatalog();
  assertSandboxCatalogLoaded();
  const packs = servedSandboxPacks();
  await writeOut(SANDBOX_PACKS_MANIFEST.pathname, JSON.stringify(packs, null, 1) + "\n");
  console.log(`${packs.length} sandbox packs written to ${SANDBOX_PACKS_MANIFEST.pathname}`);
}

/** Write the current validation split as the frozen manifest. */
async function cmdValset(): Promise<void> {
  const manifest = validationManifest((await splitRunnable()).validation);
  await writeOut(VALIDATION_MANIFEST.pathname, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`${manifest.length} validation tasks written to ${VALIDATION_MANIFEST.pathname}`);
}

async function cmdExport(): Promise<void> {
  if (!values.traces || !values.out) throw new Error("export needs --traces <file> --out <file>");
  const traces = await readJsonl<ChatTrace>(values.traces);
  const frozen = JSON.parse(await readFile(VALIDATION_MANIFEST, "utf8")) as ValidationEntry[];
  const heldIds = new Set(frozen.map((e) => e.id));
  const heldRequests = new Set(frozen.map((e) => normalizeObjective(e.objective)));
  const isValidation = (trace: ChatTrace): boolean =>
    heldIds.has(trace.taskId) ||
    trace.taskId.startsWith("val/") ||
    (!trace.taskId.startsWith("gen/") && isHeldOut(trace.taskId)) ||
    heldRequests.has(normalizeObjective(trace.objective));
  // `--split val` exports only the validation traces, for a held-out loss; they
  // never reach a training file, which is the default `--split train` export.
  if (values.split !== "train" && values.split !== "val") {
    throw new Error(`--split must be train or val, not ${values.split}`);
  }
  const { records, summary } =
    values.split === "val"
      ? exportSft(traces.filter(isValidation))
      : exportSft(traces, { heldOut: isValidation });
  await writeOut(values.out, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
  console.log(JSON.stringify({ traces: traces.length, ...summary }, null, 1));
}

initTestDb();
const commands: Record<string, () => Promise<void>> = {
  tasks: cmdTasks,
  sample: cmdSample,
  export: cmdExport,
  valset: cmdValset,
  packs: cmdPacks
};
const run = commands[command];
if (!run) throw new Error(`usage: finetune-data.ts <${Object.keys(commands).join("|")}> [options]`);
await run();
process.exit(0);
