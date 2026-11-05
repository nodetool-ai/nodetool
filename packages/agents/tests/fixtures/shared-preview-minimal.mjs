import { registerHooks } from 'node:module';
let nativeLoads = 0;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'webgpu') {
      nativeLoads++;
      throw new Error('webgpu omitted from minimal install');
    }
    return nextResolve(specifier, context);
  }
});
const { toolForCapabilityName } = await import('../../src/capabilities/lazy-tool.ts');
toolForCapabilityName('preview_timeline_frame');
if (nativeLoads !== 0) throw new Error('Tool registration loaded Dawn');
const { createRenderChild } = await import('../../src/timeline-preview/render-child-client.ts');
const child = await createRenderChild(undefined, new URL('./preview-child-missing-addon.mjs', import.meta.url));
try {
  await child.render({ width: 16, height: 16, referenceWidth: 16, referenceHeight: 16, layers: [], groups: [], adjustments: [] });
  throw new Error('Rendering unexpectedly succeeded without webgpu');
} catch (error) {
  if (nativeLoads !== 0 || !/webgpu/.test(error.message) || !/install/i.test(error.message)) throw error;
  console.log(JSON.stringify({ ordinaryToolLoaded: true, parentNativeLoads: nativeLoads, error: error.message }));
} finally {
  await child.dispose();
}
