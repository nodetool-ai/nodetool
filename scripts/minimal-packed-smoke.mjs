import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { pack, unpack } from "msgpackr";
import WebSocket from "ws";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { OpenAITextProvider } from "@nodetool-ai/runtime-core";

const { createMinimalServer } = await import(process.argv[2] ?? "@nodetool-ai/server-minimal");
const remote = new OpenAITextProvider({ apiKey: "fixture-key", fetch: async () => {
  const chunks = [
    { id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta: { content: "remote fixture" }, finish_reason: null }] },
    { id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }
  ];
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
} });
const remoteChunks = [];
for await (const chunk of remote.stream({ model: "fixture", messages: [{ role: "user", content: "hello" }], signal: new AbortController().signal })) { remoteChunks.push(chunk); }
assert.deepEqual(remoteChunks, [{ done: false, text: "remote fixture" }, { done: true, usage: { inputTokens: 1, outputTokens: 2 } }]);
const token = "packed-auth-token-0000000000000000";
const otherToken = "other-auth-token-00000000000000000";
const headers = { authorization: `Bearer ${token}` };
let chunks = 0;
const options = {
  directory: "./data",
  masterKey: "k".repeat(32),
  tokens: { [token]: "packed-user", [otherToken]: "other-user" },
  provider: {
    async *stream(request) {
      yield { done: false, text: "hello" };
      chunks += 1;
      if (request.messages.some(message => message.content === "wait")) {
        await setTimeout(60000, undefined, { signal: request.signal });
      }
      yield { done: false, text: " world" };
      chunks += 1;
      yield { done: true, usage: { inputTokens: 1, outputTokens: 2 } };
    }
  }
};
const graph = prompt => ({ nodes: [
  { id: "text", type: "openai.text.ChatComplete", properties: { model: "fixture", prompt } },
  { id: "out", type: "nodetool.output.Output", properties: { name: "result" } }
], edges: [{ source: "text", target: "out", sourceHandle: "output", targetHandle: "value" }] });
let app = await createMinimalServer(options);
let socket;
try {
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/api/workflows" })).statusCode, 401);
  const created = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Packed persistence", graph: graph("hello") } });
  assert.equal(created.statusCode, 200, created.body);
  const workflow = created.json();
  assert.match(workflow.id, /^[a-f0-9]{32}$/);
  const bytes = Buffer.from([0, 255, 137, 80, 78, 71, 13, 10]);
  const uploaded = await app.inject({ method: "POST", url: "/api/assets?name=binary.bin", headers: { ...headers, "content-type": "application/octet-stream" }, payload: bytes });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const asset = uploaded.json();
  await app.close();
  app = await createMinimalServer(options);
  const restored = await app.inject({ url: `/api/workflows/${workflow.id.slice(0, 12)}`, headers });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json().name, "Packed persistence");
  assert.equal((await app.inject({ url: `/api/workflows/${workflow.id}`, headers: { authorization: `Bearer ${otherToken}` } })).statusCode, 404);
  const downloaded = await app.inject({ url: `/api/storage/${asset.id}`, headers });
  assert.deepEqual(downloaded.rawPayload, bytes);
  assert.equal((await app.inject({ url: `/api/storage/${asset.id}`, headers: { authorization: `Bearer ${otherToken}` } })).statusCode, 404);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`, { headers });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const events = [];
  socket.on("message", bytes => { events.push(unpack(bytes)); });
  const clientJobId = "c".repeat(32);
  socket.send(pack({ command: "run_job", data: { job_id: clientJobId, workflow_id: workflow.id } }));
  for (let attempt = 0; attempt < 200 && !events.some(event => event.type === "job_update" && event.status === "completed" && event.result !== undefined); attempt++) { await setTimeout(10); }
  const completed = events.find(event => event.type === "job_update" && event.status === "completed" && event.result !== undefined);
  assert.ok(completed, JSON.stringify(events));
  assert.deepEqual(completed.result, { result: ["hello world"] });
  assert.equal(completed.job_id, clientJobId);
  assert.ok(events.length > 2);
  assert.ok(events.every(event => event.job_id === clientJobId && event.workflow_id === workflow.id && Number.isInteger(event.job_seq)), JSON.stringify(events));
  socket.terminate();
  socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`, { headers });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const resumed = [];
  socket.on("message", bytes => resumed.push(unpack(bytes)));
  socket.send(pack({ command: "reconnect_job", data: { job_id: clientJobId, last_seq: 1 } }));
  for (let attempt = 0; attempt < 200 && !resumed.some(event => event.result !== undefined); attempt++) { await setTimeout(10); }
  assert.equal(resumed[0].type, "job_resumed");
  assert.equal(resumed[0].status, "finished");
  assert.equal(resumed[0].workflow_id, workflow.id);
  assert.ok(resumed.slice(1).every(event => event.job_id === clientJobId && event.workflow_id === workflow.id && event.job_seq > 1));
  assert.ok(resumed.some(event => event.result !== undefined));
  assert.equal(chunks, 2);
  const accounted = (await app.inject({ url: `/api/jobs/${completed.job_id}`, headers })).json();
  assert.deepEqual(accounted.metadata_json.usage, { input_tokens: 1, output_tokens: 2 });
  const waiting = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Cancel", graph: graph("wait") } });
  const run = await app.inject({ method: "POST", url: `/api/workflows/${waiting.json().id}/run`, headers, payload: {} });
  assert.equal(run.statusCode, 202, run.body);
  const jobId = run.json().job_id;
  assert.equal((await app.inject({ method: "POST", url: `/api/jobs/${jobId}/cancel`, headers })).statusCode, 200);
  let status;
  for (let attempt = 0; attempt < 200; attempt++) {
    status = (await app.inject({ url: `/api/jobs/${jobId}`, headers })).json().status;
    if (status !== "running") { break; }
    await setTimeout(10);
  }
  assert.equal(status, "cancelled");
  const missingGraph = { nodes: [{ id: "missing", type: "nodetool.code.Code", properties: { code: "preserve me" } }], edges: [] };
  const missing = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Unavailable", graph: missingGraph } });
  const unavailable = await app.inject({ method: "POST", url: `/api/workflows/${missing.json().id}/run`, headers, payload: {} });
  assert.notEqual(unavailable.statusCode, 202);
  assert.match(unavailable.body, /FEATURE_NOT_INSTALLED/);
  assert.deepEqual((await app.inject({ url: `/api/workflows/${missing.json().id}`, headers })).json().graph, missingGraph);
  const anthropicGraph = { nodes: [{ id: "removed-provider", type: "anthropic.text.ChatComplete", properties: { model: "fixture", prompt: "keep me" } }], edges: [] };
  const anthropic = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Removed provider", graph: anthropicGraph } });
  assert.equal(anthropic.statusCode, 200, anthropic.body);
  const removed = await app.inject({ method: "POST", url: `/api/workflows/${anthropic.json().id}/run`, headers, payload: {} });
  assert.match(removed.body, /FEATURE_NOT_INSTALLED/);
  assert.match(removed.body, /provider-anthropic/);
  assert.deepEqual((await app.inject({ url: `/api/workflows/${anthropic.json().id}`, headers })).json().graph, anthropicGraph);
  const staleId = "e".repeat(32);
  const staleRepository = createSqliteRepository("./data/nodetool.db");
  await staleRepository.put("jobs", "packed-user", { id: staleId, workflow_id: workflow.id, status: "running" });
  await staleRepository.close();
  socket.terminate();
  await app.close();
  app = await createMinimalServer(options);
  const restartedAddress = await app.listen({ host: "127.0.0.1", port: 0 });
  socket = new WebSocket(`${restartedAddress.replace("http:", "ws:")}/ws`, { headers });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const staleEvents = [];
  socket.on("message", bytes => staleEvents.push(unpack(bytes)));
  socket.send(pack({ command: "reconnect_job", data: { job_id: staleId, last_seq: 0 } }));
  for (let attempt = 0; attempt < 200 && staleEvents.length === 0; attempt++) { await setTimeout(10); }
  assert.deepEqual(staleEvents[0], { type: "job_resumed", job_id: staleId, workflow_id: workflow.id, status: "unknown", last_seq: 0, replay_count: 0, replay_incomplete: true });
} finally {
  socket?.terminate();
  await app.close();
}
let activated = false;
let fixtureExecution;
const feature = { id: "packed-fixture", load: async () => ({ descriptor: { id: "packed-fixture", apiVersion: 1, capabilities: ["packed-feature"], nodeTypes: ["fixture.Constant"] }, activate({ execution }) {
  activated = true;
  fixtureExecution = execution;
  execution.register({ type: { nodeType: "fixture.Workspace", outputs: { output: "str" }, supportsDynamicInputs: true, descriptorDefaults: { input_mode: "buffered" } }, create: (_node, request) => ({ async process(inputs) {
    assert.ok(request.workspace);
    assert.match(request.workspace.localDir, /workspaces[/\\][a-f0-9]{64}[/\\][a-f0-9]{64}$/);
    assert.throws(() => request.workspace.key("../escape"));
    if (typeof inputs.value === "string") { await request.workspace.write("saved.txt", inputs.value); }
    return { output: await request.workspace.readText("saved.txt") };
  } }) });
  execution.register({ type: { nodeType: "fixture.Constant", outputs: { output: "str" }, descriptorDefaults: { input_mode: "buffered", retry_safe: false } }, create: () => ({ process: async () => ({ output: "feature value" }) }) });
} }) };
const selectedRepository = createSqliteRepository("./selected-repository.db");
let repositoryClosed = false;
const featureOptions = { ...options, directory: "./feature-data", features: [feature] };
let featured = await createMinimalServer({ ...featureOptions, repository: { ...selectedRepository, async close() { await selectedRepository.close(); repositoryClosed = true; } } });
async function workspaceRun(userId, jobId, value) {
  const events = [];
  await fixtureExecution.run({ graph: { nodes: [{ id: "workspace", type: "fixture.Workspace", properties: value === undefined ? {} : { value } }], edges: [] }, userId, jobId, signal: new AbortController().signal, emit: event => events.push(event) });
  return JSON.stringify(events);
}
try {
  assert.equal(activated, true);
  assert.ok((await featured.inject({ url: "/api/capabilities", headers })).json().capabilities.includes("packed-feature"));
  const graph = { nodes: [{ id: "feature", type: "fixture.Constant", properties: {} }, { id: "out", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "feature", target: "out", sourceHandle: "output", targetHandle: "value" }] };
  const created = await featured.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Feature", graph } });
  const run = await featured.inject({ method: "POST", url: `/api/workflows/${created.json().id}/run`, headers, payload: {} });
  assert.equal(run.statusCode, 202, run.body);
  let job;
  for (let attempt = 0; attempt < 200; attempt++) {
    job = (await featured.inject({ url: `/api/jobs/${run.json().job_id}`, headers })).json();
    if (job.status !== "running") { break; }
    await setTimeout(10);
  }
  assert.equal(job.status, "completed");
  assert.deepEqual(job.metadata_json.result, { result: ["feature value"] });
  assert.match(await workspaceRun("../packed-user", "../../run", "persisted-workspace"), /persisted-workspace/);
  assert.ok(!(await workspaceRun("other-user", "../../run")).includes("persisted-workspace"));
  assert.ok(!(await workspaceRun("../packed-user", "other-run")).includes("persisted-workspace"));
  await featured.close();
  assert.equal(repositoryClosed, true);
  featured = await createMinimalServer(featureOptions);
  assert.match(await workspaceRun("../packed-user", "../../run"), /persisted-workspace/);
} finally { await featured.close(); }
await assert.rejects(createMinimalServer({ ...options, directory: "./prerequisite-data", features: [{ id: "dependent", load: async () => ({ descriptor: { id: "dependent", apiVersion: 1, requires: ["absent"] }, activate() {} }) }] }), /Required feature absent/);
process.stdout.write("Packed feature execution and missing prerequisite checks passed\n");
process.stdout.write("Packed auth, CRUD/restart, tenant, binary assets, streaming, cancellation and missing feature smoke passed\n");
for (const featurePackage of process.argv.slice(3)) {
  const { default: feature } = await import(featurePackage);
  const installed = await createMinimalServer({ ...options, directory: `./optional-${feature.descriptor.id}`, features: [{ id: feature.descriptor.id, load: async () => feature }] });
  try {
    assert.ok((await installed.inject({ url: "/api/capabilities", headers })).json().capabilities.includes(feature.descriptor.capabilities[0]));
    let node;
    let expected;
    if (feature.descriptor.id === "code") {
      node = { id: "optional", type: "nodetool.code.Code", properties: { code: 'await output("value", typeof process + ":" + typeof require);' } };
      expected = "undefined:undefined";
    } else if (feature.descriptor.id === "document") {
      const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
      const content = "BT /F1 12 Tf 50 750 Td (Packed PDF fixture) Tj ET";
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      let pdf = "%PDF-1.4\n";
      const offsets = [0];
      for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
      const xref = Buffer.byteLength(pdf);
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const uploaded = await installed.inject({ method: "POST", url: "/api/assets?name=fixture.pdf", headers: { ...headers, "content-type": "application/octet-stream" }, payload: Buffer.from(pdf) });
      assert.equal(uploaded.statusCode, 200, uploaded.body);
      node = { id: "optional", type: "lib.pdf.ExtractText", properties: { pdf: { type: "document", asset_id: null, uri: `asset://${uploaded.json().id}` }, start_page: 0, end_page: -1 } };
      expected = "Packed PDF fixture";
    } else { throw new Error(`No smoke fixture for ${featurePackage}`); }
    const featureGraph = { nodes: [node, { id: "sink", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "optional", sourceHandle: feature.descriptor.id === "code" ? "value" : "output", target: "sink", targetHandle: "value" }] };
    const created = await installed.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: featurePackage, graph: featureGraph } });
    const run = await installed.inject({ method: "POST", url: `/api/workflows/${created.json().id}/run`, headers, payload: {} });
    assert.equal(run.statusCode, 202, run.body);
    let job;
    for (let attempt = 0; attempt < 1000; attempt++) {
      job = (await installed.inject({ url: `/api/jobs/${run.json().job_id}`, headers })).json();
      if (job.status !== "running") { break; }
      await setTimeout(20);
    }
    assert.equal(job.status, "completed", JSON.stringify(job));
    assert.ok(JSON.stringify(job).includes(expected), JSON.stringify(job));
    process.stdout.write(`Packed optional ${featurePackage} execution passed\n`);
  } finally { await installed.close(); }
}
