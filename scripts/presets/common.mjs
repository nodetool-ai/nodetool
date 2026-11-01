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
/** Image-edit presets render on the model that made the source still. Image edits take no seed. */
export const EDIT_MODEL = 'dreamina_gpt_image_2_5_sunburst';
/**
 * Video restyles edit the published dolly-in preview: the same courtyard, with
 * camera motion for the restyle to keep. Dreamina has no video-to-video mode,
 * so a restyle renders as Seedance reference-to-video with this clip as its
 * reference video.
 */
export const sourceVideoUrl = 'https://zmytgmyiwfmdajmxjbag.supabase.co/storage/v1/object/public/preset-previews/presets/camera.dolly-in/f71a51ff8637b65add4e4fb86cf57aa8ab9bce70cc6024f2c6d903fb5ff5ea90.mp4';
export const prompt = 'A large bronze ring sculpture with a twisted open loop and a green-gold patina on a rough travertine plinth in a sunlit Mediterranean stone courtyard, olive trees in terracotta pots in the foreground, an arched colonnade behind, cypress trees and mountains in the distance, golden late-afternoon light.';
/** Scene for a preset whose effect the still courtyard cannot show. A move in the scene gives a speed ramp something to change. */
const DOVES = `${prompt} A flock of white doves bursts up from the gravel in front of the sculpture and flies across the frame. The camera stays locked off.`;
const LOCKED = `${prompt} The camera stays locked off, keeping the exact framing of the source image.`;
export const SCENE_OVERRIDES = {
  'look.fast-slow-fast': DOVES,
  'look.ramp-into-slow': DOVES,
  'look.ramp-out-of-slow': DOVES,
  'look.impact-ramp': `${prompt} A heavy stone ball drops from above onto the gravel beside the plinth and throws up a burst of dust and pebbles. The camera stays locked off.`,
  'look.bleach-bypass': LOCKED
};
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
    // Studios open a surface and have no preview to render.
    if (kind === 'studio') { continue; }
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
  const videoModel = opts.final ? 'dreamina_seedance_45_pro' : 'dreamina_seedance_45_pro_draft';
  const sourceHash = hash(await readFile(source));
  const sourceVideoHash = hash(sourceVideoUrl);
  return files.filter(({ preset }) => !opts.ids || opts.ids.includes(preset.id)).flatMap(({ path, preset }) => {
    // An image-to-video preset renders a clip. A preset that only edits images
    // renders the edited still, and publishing turns it into a before-and-after loop.
    const mode = preset.modes.includes('image_to_video') ? 'image_to_video' : preset.modes.includes('image_edit') ? 'image_edit' : preset.modes.includes('video_edit') ? 'video_edit' : null;
    if (!mode) { return []; }
    const model = mode === 'image_edit' ? EDIT_MODEL : videoModel;
    // A restyle renders through reference-to-video (see sourceVideoUrl), so it
    // compiles and ejects as a reference-to-video preset with only the video input.
    const renderMode = mode === 'video_edit' ? 'reference_to_video' : mode;
    const renderPreset = mode === 'video_edit' ? { ...preset, modes: ['reference_to_video'] } : preset;
    const scene = SCENE_OVERRIDES[preset.id] ?? prompt;
    const compiled = compilePresets([preset.id], { catalog: createCatalog([renderPreset]), modelId: model, mode: renderMode, prompt: scene });
    const workflow = presetToWorkflow(renderPreset, { model: { provider: 'dreamina', id: model }, mode: renderMode });
    if (mode === 'video_edit') {
      workflow.nodes = workflow.nodes.filter((node) => node.id !== 'image');
      workflow.edges = workflow.edges.filter((edge) => edge.source !== 'image');
    }
    const generator = workflow.nodes.find((node) => node.id === 'generate');
    if (mode === 'image_edit') {
      Object.assign(generator.data, { aspect_ratio: '16:9', resolution: '2K' });
    } else {
      Object.assign(generator.data, { seed, duration: 4, resolution: opts.resolution ?? (opts.final ? '1080p' : '480p') });
    }
    return [{ id: preset.id, path, preset, mode, provider: 'dreamina', model, seed: mode === 'image_edit' ? null : seed,
      prompt: compiled.prompt, source_hash: mode === 'video_edit' ? sourceVideoHash : sourceHash,
      ...(mode === 'video_edit' ? { source_url: sourceVideoUrl } : {}),
      workflow, workflow_hash: hash(JSON.stringify({ workflow, sourceHash: mode === 'video_edit' ? sourceVideoHash : sourceHash, prompt: scene })), scene,
      recordPath: resolve(root, 'packages/presets/runs', `${preset.id}.json`),
      output_path: resolve(opts.outputDir, `${preset.id}-${model}.${mode === 'image_edit' ? 'png' : 'mp4'}`) }];
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
    source_hash: plan.source_hash, ...(plan.source_url ? { source_url: plan.source_url } : {}), credits: null, cost_usd: null,
    started_at: startedAt, finished_at: status === 'completed' ? new Date().toISOString() : null,
    output_path: plan.output_path, ...extra };
}
export const isMain = (url) => process.argv[1] && fileURLToPath(url) === resolve(process.argv[1]);
