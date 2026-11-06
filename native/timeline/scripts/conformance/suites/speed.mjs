import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('./speed.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_SPEED_BINARY: path.join(path.dirname(bin), 'tst_speed') })
};
