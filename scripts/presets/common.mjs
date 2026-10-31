import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { createCatalog, compilePresets, presetToWorkflow } from '@nodetool-ai/presets';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const source = resolve(root, 'scripts/presets/source.jpg');
export const seed = 20261031;
export const prompt = 'A large bronze ring sculpture with a twisted open loop and a green-gold patina on a rough travertine plinth in a sunlit Mediterranean stone courtyard, olive trees in terracotta pots in the foreground, an arched colonnade behind, cypress trees and mountains in the distance, golden late-afternoon light.';
export function options(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    ids: { type: 'string' }, final: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, resolution: { type: 'string' },
    'output-dir': { type: 'string', default: resolve(homedir(), '.cache/nodetool/preset-previews') }
  }});
  const outputDir = resolve(values['output-dir']);
  if (outputDir === root || outputDir.startsWith(`${root}/`)) {
    throw new Error('Preview media output must be outside the repository');
  }
  return { ids: values.ids?.split(','), final: values.final, dryRun: values['dry-run'], resolution: values.resolution, outputDir };
}
export async function catalogFiles() {
  const files = [];
  const base = resolve(root, 'packages/presets/catalog');
  for (const kind of await readdir(base)) {
    for (const name of await readdir(resolve(base, kind))) {
      if (name.endsWith('.json')) {
        const path = resolve(base, kind, name);
        files.push({ path, preset: JSON.parse(await readFile(path, 'utf8')) });
      }
    }
  }
  const catalog = createCatalog(files.map(({ preset }) => preset));
  for (const file of files) { file.preset = catalog.getPreset(file.preset.id); }
  return files.sort((a, b) => a.preset.id.localeCompare(b.preset.id));
}
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function buildPlan(opts) {
  const files = await catalogFiles();
  for (const id of opts.ids ?? []) {
    if (!files.some(({ preset }) => preset.id === id)) { throw new Error(`Unknown preset: ${id}`); }
  }
  const model = opts.final ? 'dreamina_seedance_45_pro' : 'dreamina_seedance_45_pro_draft';
  const sourceHash = hash(await readFile(source));
  return files.filter(({ preset }) => (!opts.ids || opts.ids.includes(preset.id)) && preset.modes.includes('image_to_video')).map(({ path, preset }) => {
    const compiled = compilePresets([preset.id], { catalog: createCatalog([preset]), modelId: model, mode: 'image_to_video', prompt });
    const workflow = presetToWorkflow(preset, { model: { provider: 'dreamina', id: model }, mode: 'image_to_video' });
    const generator = workflow.nodes.find((node) => node.id === 'generate');
    Object.assign(generator.data, { seed, duration: 4, resolution: opts.resolution ?? (opts.final ? '1080p' : '480p') });
    return { id: preset.id, path, preset, provider: 'dreamina', model, seed, prompt: compiled.prompt, source_hash: sourceHash,
      workflow, workflow_hash: hash(JSON.stringify({ workflow, sourceHash, prompt })),
      recordPath: resolve(root, 'packages/presets/runs', `${preset.id}.json`),
      output_path: resolve(opts.outputDir, `${preset.id}-${model}.mp4`) };
  });
}
export async function readRecord(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { return null; } throw error; }
}
export function matches(record, plan) {
  return record?.status === 'completed' && record.model === plan.model && record.prompt === plan.prompt && record.workflow_hash === plan.workflow_hash && record.seed === plan.seed;
}
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
export function runRecord(plan, status, startedAt, extra = {}) {
  return { version: 1, id: plan.id, status, workflow: plan.workflow, workflow_hash: plan.workflow_hash,
    provider: plan.provider, model: plan.model, seed: plan.seed, prompt: plan.prompt,
    source_hash: plan.source_hash, credits: null, cost_usd: null,
    started_at: startedAt, finished_at: status === 'completed' ? new Date().toISOString() : null,
    output_path: plan.output_path, ...extra };
}
export const isMain = (url) => process.argv[1] && fileURLToPath(url) === resolve(process.argv[1]);
