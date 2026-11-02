/**
 * Render candidate source stills for preset previews on several Dreamina image
 * models, so a person can pick the one every preview starts from.
 *
 *   node scripts/presets/source-stills.mjs [--models a,b] [--scenes a,b] [--output-dir dir]
 *
 * Needs the NodeTool Chrome extension connected to a signed-in Dreamina tab.
 * Writes <scene>-<model>.png and a stills.json record to the output directory.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

export const SCENES = {
  courtyard:
    'Photorealistic wide establishing shot of a weathered bronze abstract sculpture, smooth flowing curves with a warm patina, on a rough travertine plinth in the centre of a sunlit Mediterranean stone courtyard. ' +
    'Foreground: large terracotta pots with olive trees at the left and right frame edges and a raked gravel path leading to the plinth. ' +
    'Midground: an arched limestone colonnade with deep shadows behind the sculpture. ' +
    'Background: tall cypress trees and distant hazy mountains under a clear sky. ' +
    'Late afternoon golden light, long soft shadows, strong separation between foreground, midground and background. ' +
    'Eye-level camera, 35mm lens, f/8 deep focus, high dynamic range, natural colours, fine stone and metal texture detail. ' +
    'No people, no text, no logos, no watermark.',
  street:
    'Photorealistic wide shot of a glossy red vintage scooter parked at an angle on a wet cobblestone street in an old European town at golden hour. ' +
    'Foreground: a café table with two empty chairs and a flower box at the right frame edge, puddles reflecting the sky. ' +
    'Midground: the scooter in sharp focus, three-quarter view, chrome details catching the light. ' +
    'Background: narrow street receding to a sunlit church tower, pastel facades with shuttered windows and hanging plants. ' +
    'Warm low sun, long shadows, clear depth layers. ' +
    'Eye-level camera, 35mm lens, f/8 deep focus, high dynamic range, natural colours, fine texture detail. ' +
    'No people, no readable text, no logos, no watermark.'
};

export const MODELS = [
  'high_aes_general_v50p_large',
  'dreamina_gpt_image_2_5_flare',
  'dreamina_gpt_image_2_5_sunburst',
  'gpt_image_2',
  'gemini_3_image_pro'
];

const SEED = 20261031;

async function main() {
  const { values } = parseArgs({ options: {
    models: { type: 'string' }, scenes: { type: 'string' },
    'output-dir': { type: 'string', default: resolve(homedir(), '.cache/nodetool/preset-previews/source-stills') }
  }});
  const models = values.models?.split(',') ?? MODELS;
  const scenes = values.scenes?.split(',') ?? Object.keys(SCENES);
  const outputDir = resolve(values['output-dir']);
  await mkdir(outputDir, { recursive: true });

  const { DreaminaProvider } = await import('@nodetool-ai/runtime');
  const provider = new DreaminaProvider();
  const recordPath = resolve(outputDir, 'stills.json');
  const records = JSON.parse(await readFile(recordPath, 'utf8').catch(() => '[]'));

  for (const scene of scenes) {
    for (const model of models) {
      const file = resolve(outputDir, `${scene}-${model.replace(/[^a-z0-9_.-]/gi, '_')}.png`);
      if (records.some((r) => r.file === file && r.status === 'completed')) { console.log(`${scene} / ${model}: done, skipping`); continue; }
      const started = new Date().toISOString();
      try {
        const bytes = await provider.textToImage({
          model: { id: model, name: model, provider: 'dreamina' },
          prompt: SCENES[scene], aspectRatio: '16:9', resolution: '2k', seed: SEED
        });
        await writeFile(file, bytes);
        records.push({ scene, model, seed: SEED, prompt: SCENES[scene], file, status: 'completed', started, finished: new Date().toISOString() });
        console.log(`${scene} / ${model}: ${bytes.length} bytes`);
      } catch (error) {
        records.push({ scene, model, file, status: 'failed', error: error.message, started });
        console.log(`${scene} / ${model}: FAILED ${error.message}`);
      }
      await writeFile(recordPath, JSON.stringify(records, null, 2));
    }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
