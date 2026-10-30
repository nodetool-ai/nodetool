import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it, vi } from 'vitest';
import { ProcessingContext } from '@nodetool-ai/runtime';
import { executeScopedNode, localTransformersService } from '../src/scoped-services.js';

const exec = promisify(execFile);

it('accepts the real installed Transformers and browser namespaces without type assertions', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const cache = join(root, 'node_modules/.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'local-transformers-contract-'));
  const probe = join(directory, 'consumer.mts');
  const service = resolve(import.meta.dirname, '../src/scoped-services.js').replaceAll('\\', '/');
  try {
    await writeFile(probe, `import type * as Transformers from '@huggingface/transformers';
import type * as Browser from '@nodetool-ai/browser';
import { localTransformersService, isolatedBrowserService } from ${JSON.stringify(service)};
declare const runtime: typeof Transformers;
declare const browser: typeof Browser;
const open = localTransformersService(runtime, { small: '/approved/model' });
const openBrowser = isolatedBrowserService(browser);
void open;
void openBrowser;
`);
    try {
      await exec(process.execPath, [join(root, 'scripts/run-tsc.mjs'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'Node16', '--moduleResolution', 'Node16', '--types', 'node', '--lib', 'ES2022,DOM', probe], { cwd: root });
    } catch (error) {
      if (error instanceof Error && 'stdout' in error) { throw new Error(`Public SDK contracts did not compile:\n${String(error.stdout)}`, { cause: error }); }
      throw error;
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);

it.each([
  { kind: 'chat', result: [{ generated_text: [{ role: 'assistant', content: 'chat output' }] }] },
  { kind: 'batch', result: [[{ generated_text: 'batched output' }]] },
  { kind: 'invalid', result: [{ generated_text: 42 }] }
])('rejects $kind single-prompt output and disposes its pipeline', async ({ result }) => {
  const dispose = vi.fn(async () => {});
  const pipeline = async () => Object.assign(async () => result, { dispose });
  const openLocalGeneration = localTransformersService({ pipeline, InterruptableStoppingCriteria: class { interrupt(): void {} } }, { small: '/approved/model' });
  const context = new ProcessingContext({ jobId: 'contract', userId: 'alice', inheritHostDefaults: false });
  await expect(executeScopedNode('transformers.TextGeneration', { model: 'small', prompt: 'hello' }, context, { openLocalGeneration })).rejects.toThrow('non-text result');
  expect(dispose).toHaveBeenCalledOnce();
});

it('disposes a non-callable pipeline before rejecting the runtime protocol', async () => {
  const dispose = vi.fn(async () => {});
  const open = localTransformersService({ pipeline: async () => ({ dispose }), InterruptableStoppingCriteria: class { interrupt(): void {} } }, { small: '/approved/model' });
  const context = new ProcessingContext({ jobId: 'contract', userId: 'alice', inheritHostDefaults: false });
  await expect(open({ model: 'small' }, context)).rejects.toThrow('non-callable pipeline');
  expect(dispose).toHaveBeenCalledOnce();
});

it('preserves the pipeline receiver when disposing', async () => {
  const pipeline = Object.assign(async () => [{ generated_text: 'hello' }], {
    async dispose(): Promise<void> { expect(this).toBe(pipeline); }
  });
  const openLocalGeneration = localTransformersService({ pipeline: async () => pipeline, InterruptableStoppingCriteria: class { interrupt(): void {} } }, { small: '/approved/model' });
  const context = new ProcessingContext({ jobId: 'contract', userId: 'alice', inheritHostDefaults: false });
  await expect(executeScopedNode('transformers.TextGeneration', { model: 'small', prompt: 'hello' }, context, { openLocalGeneration })).resolves.toEqual({ text: 'hello' });
});
