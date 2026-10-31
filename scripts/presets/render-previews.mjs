import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { options, buildPlan, readRecord, matches, atomicJson, runRecord, source, prompt, isMain } from './common.mjs';

export async function renderPlans(plans, { dryRun, checkConnection, render, log = console.log }) {
  const pending = [];
  for (const plan of plans) {
    const record = await readRecord(plan.recordPath);
    if (dryRun) { log(JSON.stringify({ id: plan.id, prompt: plan.prompt, model: plan.model, output: plan.output_path, action: matches(record, plan) ? 'skip' : 'render' })); continue; }
    if (matches(record, plan)) { log(`${plan.id}: completed, skipping`); continue; }
    pending.push(plan);
  }
  if (!pending.length) { return; }
  await checkConnection();
  for (const plan of pending) {
    const started = new Date().toISOString();
    await atomicJson(plan.recordPath, runRecord(plan, 'running', started));
    try {
      const result = await render(plan);
      await mkdir(dirname(plan.output_path), { recursive: true });
      await writeFile(plan.output_path, result.bytes);
      await atomicJson(plan.recordPath, runRecord(plan, 'completed', started, {
        credits: result.credits ?? null, cost_usd: result.cost_usd ?? null
      }));
    } catch (error) {
      await atomicJson(plan.recordPath, runRecord(plan, 'interrupted', started, { error: error.message }));
      throw new Error(`${plan.id}: rendering stopped. Inspect the tab and run record before retrying. ${error.message}`, { cause: error });
    }
  }
}
async function checkConnection() {
  const { isBridgeAvailable, createExtensionPage } = await import('@nodetool-ai/browser');
  if (!await isBridgeAvailable()) { throw new Error('NodeTool Chrome extension is not connected. Connect it and open a signed-in https://dreamina.capcut.com tab.'); }
  const handle = await createExtensionPage(undefined, { urlMatch: 'dreamina.capcut.com', signal: AbortSignal.timeout(15000) });
  try {
    if (await handle.page.evaluate('location.hostname') !== 'dreamina.capcut.com') { throw new Error('Open the signed-in Dreamina tab in Chrome'); }
  } finally { await handle.close(); }
}
async function render(plan) {
  const { run } = await import('@nodetool-ai/dsl');
  const { loadMediaRefBytes } = await import('@nodetool-ai/runtime/media-ref-bytes');
  const image = { type: 'image', data: (await readFile(source)).toString('base64') };
  const result = await run(plan.workflow, { params: { prompt, image } });
  const bytes = await loadMediaRefBytes(result.result);
  if (!bytes?.length) { throw new Error('Workflow produced no video bytes'); }
  return { bytes };
}
export async function main(args) {
  const opts = options(args);
  await renderPlans(await buildPlan(opts), { ...opts, checkConnection, render });
}
if (isMain(import.meta.url)) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
