import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('../../../src/edit/clipboard/clipboard-differential.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_STRUCTURE_OPS: path.join(path.dirname(bin), 'structure-ops') })
};
