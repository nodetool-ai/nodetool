/**
 * Run jobs-to-be-done through the real product chat turn (see src/chat-jtbd.ts).
 *
 *   npx tsx packages/websocket/scripts/chat-jtbd.ts -p ollama -m qwen3.5:9b \
 *     --jobs storyboard-a-scene,timeline-assemble-cut \
 *     --manifest web-manifest.json --out nodetool-debug/chat-jtbd/qwen.json
 *
 * For Ollama the script also records `prompt_eval_count` per model request,
 * which is the context the turn actually used.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { initTestDb } from "@nodetool-ai/models";
import { getProvider, OllamaProvider, type BaseProvider } from "@nodetool-ai/runtime";
import { JOBS_TO_BE_DONE, listCapabilitySpecs } from "@nodetool-ai/agents";
import { runChatJob, type ClientToolManifestEntry } from "../src/chat-jtbd.js";

const { values } = parseArgs({
  options: {
    provider: { type: "string", short: "p" },
    model: { type: "string", short: "m" },
    jobs: { type: "string" },
    manifest: { type: "string" },
    out: { type: "string" },
    timeout: { type: "string" }
  }
});
if (!values.provider || !values.model) {
  throw new Error("usage: chat-jtbd.ts -p <provider> -m <model> [--jobs a,b] [--manifest f.json] [--out f.json]");
}

/** Prompt tokens of each Ollama request in the current job. */
let promptTokens: number[] = [];

async function buildProvider(id: string): Promise<BaseProvider> {
  if (id !== "ollama") return getProvider(id, async (key) => process.env[key]);
  const fetchFn: typeof fetch = async (url, init) => {
    const res = await fetch(url, init);
    if (!String(url).endsWith("/api/chat")) return res;
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.includes('"done":true')) continue;
      const parsed = JSON.parse(line) as { prompt_eval_count?: number };
      if (typeof parsed.prompt_eval_count === "number") promptTokens.push(parsed.prompt_eval_count);
    }
    return new Response(text, { status: res.status, headers: res.headers });
  };
  return new OllamaProvider(
    { OLLAMA_API_URL: process.env.OLLAMA_API_URL ?? "http://localhost:11434" },
    { fetchFn }
  );
}

initTestDb();
const provider = await buildProvider(values.provider);
const extraManifest = values.manifest
  ? (JSON.parse(await readFile(values.manifest, "utf8")) as ClientToolManifestEntry[])
  : [];
const serverToolNames = new Set(listCapabilitySpecs().map((spec) => spec.name));
const wanted = values.jobs ? new Set(values.jobs.split(",")) : null;
const jobs = JOBS_TO_BE_DONE.filter((job) => wanted === null || wanted.has(job.id));

const reports = [];
for (const job of jobs) {
  promptTokens = [];
  const report = await runChatJob(job, {
    provider,
    model: values.model,
    extraManifest,
    serverToolNames,
    ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {})
  });
  const tokens = [...promptTokens];
  reports.push({ ...report, promptTokens: tokens });
  const status = report.skipped ? `SKIP (${report.skipReason})` : report.achieved ? "PASS" : "FAIL";
  const checks = report.outcomes.map((o) => `${o.name}:${o.passed ? "ok" : "x"}`).join(" ");
  const ctx = tokens.length > 0 ? ` prompt tokens first=${tokens[0]} max=${Math.max(...tokens)} requests=${tokens.length}` : "";
  console.log(`${status} ${job.id} ${Math.round(report.durationMs / 1000)}s calls=${report.toolCalls.length} ${checks}${ctx}${report.error ? ` error=${report.error}` : ""}`);
}

const ran = reports.filter((r) => !r.skipped);
console.log(`achieved ${ran.filter((r) => r.achieved).length}/${ran.length}`);
if (values.out) {
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, JSON.stringify({ provider: values.provider, model: values.model, reports }, null, 1));
}
process.exit(0);
