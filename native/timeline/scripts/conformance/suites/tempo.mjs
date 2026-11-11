import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  config: 'vitest.config.mts',
  tests: [fileURLToPath(new URL('./tempo.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_TEMPO_BINARY: path.join(path.dirname(bin), 'tst_tempo') })
};
