import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('./merge.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_MERGE_BINARY: path.join(path.dirname(bin), 'tst_sync') })
};
