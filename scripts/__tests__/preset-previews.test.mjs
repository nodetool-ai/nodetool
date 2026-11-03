import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { buildPlan, options, matches, runRecord, atomicJson, prompt } from '../presets/common.mjs';
import { renderPlans } from '../presets/render-previews.mjs';
import { publishPlans } from '../presets/publish-previews.mjs';

async function fixture(run) {
  const dir = await mkdtemp(resolve(tmpdir(), 'preset-test-'));
  try {
    const [plan] = await buildPlan(options(['--ids', 'camera.arc', '--output-dir', dir]));
    plan.recordPath = resolve(dir, 'run.json');
    plan.output_path = resolve(dir, 'render.mp4');
    plan.path = resolve(dir, 'preset.json');
    await run(plan);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const forbidden = async () => { throw new Error('Unexpected side effect'); };
describe('preset preview tooling', () => {
  it('builds a deterministic eject plan and forwards the fixed seed', async () => {
    const opts = options(['--ids', 'camera.arc']);
    const [a] = await buildPlan(opts);
    const [b] = await buildPlan(opts);
    expect(a.workflow_hash).toBe(b.workflow_hash);
    expect(a.workflow.nodes.find(n => n.id === 'generate').data.seed).toBe(a.seed);
    expect(a.prompt).toContain('courtyard');
    expect(a.model).toBe('dreamina_seedance_45_pro_draft');
    expect(matches(runRecord(a, 'completed', '2026-01-01'), a)).toBe(true);
    expect(matches(runRecord(a, 'running', '2026-01-01'), a)).toBe(false);
    expect(matches({ ...runRecord(a, 'completed', '2026-01-01'), prompt: 'changed' }, a)).toBe(false);
    expect(matches({ ...runRecord(a, 'completed', '2026-01-01'), model: 'changed' }, a)).toBe(false);
    await expect(buildPlan(options(['--ids', 'camera.missing']))).rejects.toThrow('Unknown preset');
  });
  it('plans an image-edit preset as an edited still on the image model', async () => {
    const [plan] = await buildPlan(options(['--ids', 'effect.snow-blanket']));
    expect(plan.mode).toBe('image_edit');
    expect(plan.model).toBe('dreamina_gpt_image_2_5_sunburst');
    expect(plan.seed).toBeNull();
    expect(plan.output_path).toMatch(/\.png$/);
    expect(plan.workflow.nodes.find(n => n.id === 'generate').type).toBe('nodetool.image.ImageToImage');
    expect(matches(runRecord(plan, 'completed', '2026-01-01'), plan)).toBe(true);
  });
  it('plans a video restyle as reference-to-video on the published source clip', async () => {
    const [plan] = await buildPlan(options(['--ids', 'effect.restyle-noir']));
    expect(plan.mode).toBe('video_edit');
    expect(plan.model).toBe('dreamina_seedance_45_pro_draft');
    expect(plan.source_url).toMatch(/^https:\/\/.+camera\.dolly-in\/.+\.mp4$/);
    expect(plan.workflow.nodes.find(n => n.id === 'generate').type).toBe('nodetool.video.ReferenceToVideo');
    expect(plan.workflow.nodes.map(n => n.id)).not.toContain('image');
    expect(plan.workflow.edges.find(e => e.source === 'video').targetHandle).toBe('reference_videos');
    expect(runRecord(plan, 'completed', '2026-01-01').source_url).toBe(plan.source_url);
  });
  it('renders a speed ramp on a scene with motion and leaves other looks alone', async () => {
    const [ramp, still] = await buildPlan(options(['--ids', 'look.fast-slow-fast,look.kodak-5219']));
    expect(ramp.scene).toContain('doves');
    expect(ramp.prompt).toContain('doves');
    expect(still.scene).not.toContain('doves');
    expect(still.scene).toBe(prompt);
  });
  it('writes complete records with a fake provider and skips matching runs', () => fixture(async plan => {
    let calls = 0;
    const fakeProvider = async () => { calls++; return { bytes: Buffer.from('fake video'), credits: 7, cost_usd: 0.01 }; };
    const deps = { checkConnection: async () => {}, render: fakeProvider, log: () => {} };
    await renderPlans([plan], deps);
    await renderPlans([plan], { ...deps, checkConnection: forbidden });
    expect(calls).toBe(1);
    const record = JSON.parse(await readFile(plan.recordPath, 'utf8'));
    expect(record).toMatchObject({ status: 'completed', provider: 'dreamina', credits: 7, cost_usd: 0.01, output_path: plan.output_path });
    expect(Date.parse(record.finished_at)).toBeGreaterThanOrEqual(Date.parse(record.started_at));
    expect(await readFile(plan.output_path, 'utf8')).toBe('fake video');
  }));
  it('stops on a stall and resumes incomplete runs on the next invocation', () => fixture(async plan => {
    await expect(renderPlans([plan], { checkConnection: async () => {}, render: async () => { throw new Error('ExtensionTabStallError'); } })).rejects.toThrow('rendering stopped');
    expect(JSON.parse(await readFile(plan.recordPath, 'utf8')).status).toBe('interrupted');
    await renderPlans([plan], { checkConnection: async () => {}, render: async () => ({ bytes: Buffer.from('recovered') }) });
    expect(JSON.parse(await readFile(plan.recordPath, 'utf8')).status).toBe('completed');
  }));
  it('dry runs neither render nor upload nor mutate files', () => fixture(async plan => {
    const lines = [];
    await renderPlans([plan], { dryRun: true, checkConnection: forbidden, render: forbidden, log: s => lines.push(s) });
    await expect(readFile(plan.recordPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await atomicJson(plan.recordPath, runRecord(plan, 'completed', '2026-01-01'));
    await publishPlans([plan], { dryRun: true, encode: forbidden, upload: forbidden, regenerate: forbidden, log: s => lines.push(s) });
    expect(lines.join('\n')).toContain('presets/camera.arc');
    await expect(readFile(plan.path)).rejects.toMatchObject({ code: 'ENOENT' });
  }));
  it('publishes encoded output through an injected adapter and regenerates', () => fixture(async plan => {
    await atomicJson(plan.recordPath, runRecord(plan, 'completed', '2026-01-01'));
    const uploads = [];
    let regenerated = false;
    await publishPlans([plan], { encode: async () => ({ video: Buffer.from('video'), poster: Buffer.from('poster') }),
      upload: async (key, bytes, type) => { uploads.push({ key, bytes, type }); return `https://example.com/${key}`; },
      regenerate: async () => { regenerated = true; } });
    expect(uploads.map(u => u.type)).toEqual(['video/mp4', 'image/png']);
    expect(regenerated).toBe(true);
    expect(JSON.parse(await readFile(plan.path, 'utf8')).preview.run).toBe('runs/camera.arc.json');
  }));
  it('publishes a look with a late poster under its own key', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'preset-test-'));
    try {
      const [plan] = await buildPlan(options(['--ids', 'look.kodak-5219', '--output-dir', dir]));
      plan.recordPath = resolve(dir, 'run.json');
      plan.path = resolve(dir, 'preset.json');
      await atomicJson(plan.recordPath, runRecord(plan, 'completed', '2026-01-01'));
      const keys = [];
      const encodes = [];
      await publishPlans([plan], {
        encode: async (_path, encodeOptions) => { encodes.push(encodeOptions); return { video: new Uint8Array([1]), poster: new Uint8Array([2]) }; },
        upload: async (key) => { keys.push(key); return `https://example.test/${key}`; },
        regenerate: async () => undefined
      });
      expect(encodes).toEqual([{ latePoster: true }]);
      expect(keys[1]).toMatch(/-late\.png$/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('both CLI entry points support dry-run without Chrome or credentials', async () => {
    for (const script of ['render', 'publish']) {
      const { stdout } = await promisify(execFile)(process.execPath, [`scripts/presets/${script}-previews.mjs`, '--ids', 'camera.arc', '--dry-run']);
      expect(stdout).toContain('camera.arc');
    }
  });
});
