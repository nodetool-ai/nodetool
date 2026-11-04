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
const { createSharedPreviewCompositor } = await import('../../src/timeline-preview/shared-compositor.ts');
try {
  await createSharedPreviewCompositor(160, 90, 160, 90);
  throw new Error('Rendering unexpectedly succeeded without webgpu');
} catch (error) {
  if (nativeLoads !== 1 || !/webgpu/.test(error.message) || !/install/i.test(error.message)) throw error;
  console.log(JSON.stringify({ ordinaryToolLoaded: true, nativeLoads, error: error.message }));
}
