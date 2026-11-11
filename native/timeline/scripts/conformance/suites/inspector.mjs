import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Suite contract: an existing config, nonempty absolute test paths, optional env.
export default {
  config: 'vitest.config.mts',
  tests: [fileURLToPath(new URL('./inspector.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_INSPECTOR_HELPERS: path.join(path.dirname(bin), 'tst_inspectorprimitives') })
};
