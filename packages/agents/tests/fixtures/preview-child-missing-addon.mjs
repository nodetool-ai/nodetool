import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'webgpu') throw new Error('webgpu omitted from minimal install');
    return nextResolve(specifier, context);
  }
});
await import('../../src/timeline-preview/render-child.ts');
