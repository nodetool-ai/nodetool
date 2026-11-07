// Long-lived TypeScript reference for the parity suite. Loads ALL_BASE_NODES
// once, then runs one case per request. Requests arrive on stdin and results
// leave on fd 3, one JSON object per line, so node code that prints to stdout
// cannot corrupt the protocol.
//
//   request:  {"id": "...", "graph": {...}, "params": {...}, "workspace": "/dir", "timeout_ms": 20000}
//   result:   {"id": "...", "messages": [...], "timed_out": false}
//   first line out: {"ready": true, "inventory": [...]}
//
// Each graph is hydrated as tools/ts-reference.mjs hydrates it (the server's
// JobExecution.normalizeGraph, then Graph.loadFromDict with the registry
// resolver), and runs through runWorkflow with job "job", workflow "wf" and
// platform "node". The context has in-memory storage and no secret resolver.
// With `workspace`, the run's workspace is that directory (a local workspace,
// as on a desktop install) and the process works in it, so relative paths
// resolve there as they do in the native runner.
// run.mjs starts this process without network, secrets or a .env file.
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Graph } from "@nodetool-ai/execution-core";
import { runWorkflow } from "@nodetool-ai/workflow-runner";
import { createGraphNodeTypeResolver, NodeRegistry } from "@nodetool-ai/node-sdk";
import { ALL_BASE_NODES } from "@nodetool-ai/base-nodes";
import { FileStorageAdapter, InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { buildInventory } from "./inventory.mjs";

const out = createWriteStream(null, { fd: 3 });
const send = (obj) => new Promise((resolve) => out.write(JSON.stringify(obj) + "\n", resolve));

const registry = new NodeRegistry();
for (const cls of ALL_BASE_NODES) registry.register(cls);
const resolver = createGraphNodeTypeResolver(registry).resolveNodeType;

function normalize(graph) {
  return {
    nodes: graph.nodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    }),
    edges: graph.edges.map((edge) => {
      const rawEdgeType = edge.edge_type ?? edge.type;
      const { type, ...rest } = edge;
      return { ...rest, edge_type: rawEdgeType === "control" ? "control" : "data" };
    })
  };
}

/**
 * Message values can hold bytes, which JSON cannot carry. Mark them instead.
 * The pixels of a raw-RGBA image (what GPU image nodes output on Node) are
 * kept as base64, so compare.mjs can compare images by pixel.
 */
function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, function (k, v) {
      if (k === "data" && v instanceof Uint8Array && this?.mimeType === "image/x-raw-rgba") {
        return { __rgba__: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") };
      }
      if (v instanceof Uint8Array) return { __bytes__: v.byteLength };
      if (typeof v === "bigint") return { __bigint__: String(v) };
      return v;
    })
  );
}

async function runCase(request) {
  const messages = [];
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeout_ms ?? 20_000);
  const home = process.cwd();
  try {
    if (request.workspace) process.chdir(request.workspace);
    const hydrated = await Graph.loadFromDict(normalize(request.graph), { resolver });
    const gen = runWorkflow({
      graph: { nodes: [...hydrated.nodes], edges: [...hydrated.edges] },
      registry,
      params: request.params ?? {},
      jobId: "job",
      workflowId: "wf",
      platform: "node",
      storage: new InMemoryStorageAdapter(),
      workspaceStorage: request.workspace ? new FileStorageAdapter(request.workspace) : null,
      signal: controller.signal
    });
    for (let r = await gen.next(); !r.done; r = await gen.next()) messages.push(jsonSafe(r.value));
    return { id: request.id, messages, timed_out: timedOut };
  } catch (err) {
    return {
      id: request.id,
      messages,
      timed_out: timedOut,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    };
  } finally {
    clearTimeout(timer);
    process.chdir(home);
  }
}

await send({ ready: true, inventory: await buildInventory() });

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  await send(await runCase(JSON.parse(line)));
}
out.end();
process.exit(0);
