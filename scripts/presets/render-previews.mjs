import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { options, buildPlan, readRecord, matches, atomicJson, runRecord, source, sourceVideoUrl, isMain } from './common.mjs';

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
  const rejected = [];
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
      // Dreamina refused this one output (a moderation or copyright check).
      // The tab is fine, so record it and move on to the next preset.
      if (/Dreamina generation failed/.test(error.message)) {
        await atomicJson(plan.recordPath, runRecord(plan, 'rejected', started, { error: error.message }));
        log(`${plan.id}: rejected by Dreamina, continuing. ${error.message}`);
        rejected.push(plan.id);
        continue;
      }
      await atomicJson(plan.recordPath, runRecord(plan, 'interrupted', started, { error: error.message }));
      throw new Error(`${plan.id}: rendering stopped. Inspect the tab and run record before retrying. ${error.message}`, { cause: error });
    }
  }
  if (rejected.length) {
    throw new Error(`Dreamina rejected ${rejected.length} preset(s): ${rejected.join(', ')}. Rerun to retry them.`);
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
let storageReady = null;
/**
 * The ejected graph ends in an Output node, which saves its value as an asset.
 * Point that at a scratch database and asset folder beside the preview media
 * so previews never land in the user's own library.
 */
function prepareStorage(outputDir) {
  storageReady ??= (async () => {
    const scratch = resolve(outputDir, '.render-store');
    await mkdir(resolve(scratch, 'assets'), { recursive: true });
    process.env.DB_PATH = resolve(scratch, 'nodetool.sqlite3');
    process.env.ASSET_FOLDER = resolve(scratch, 'assets');
    const { initDb, migrateSqliteDb } = await import('@nodetool-ai/models');
    await migrateSqliteDb(process.env.DB_PATH);
    initDb(process.env.DB_PATH);
    const { installLocalModelInterfaces } = await import('@nodetool-ai/cli-execution/local-model-interfaces');
    await installLocalModelInterfaces();
  })();
  return storageReady;
}
let sourceVideoBytes = null;
async function sourceVideo() {
  if (!sourceVideoBytes) {
    const response = await fetch(sourceVideoUrl);
    if (!response.ok) { throw new Error(`Restyle source video: HTTP ${response.status}`); }
    sourceVideoBytes = Buffer.from(await response.arrayBuffer());
  }
  return sourceVideoBytes;
}
async function render(plan) {
  await prepareStorage(dirname(plan.output_path));
  const { run } = await import('@nodetool-ai/dsl');
  const { loadMediaRefBytes } = await import('@nodetool-ai/runtime/media-ref-bytes');
  const params = plan.mode === 'video_edit'
    ? { prompt: plan.scene, video: { type: 'video', data: (await sourceVideo()).toString('base64') } }
    : { prompt: plan.scene, image: { type: 'image', data: (await readFile(source)).toString('base64') } };
  const result = await run(plan.workflow, { params });
  const bytes = await loadMediaRefBytes(result.result);
  if (!bytes?.length) { throw new Error('Workflow produced no video bytes'); }
  return { bytes };
}
export async function main(args) {
  const opts = options(args);
  await renderPlans(await buildPlan(opts), { ...opts, checkConnection, render });
}
if (isMain(import.meta.url)) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
