import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('./assets.test.ts', import.meta.url)),
    fileURLToPath(new URL('../../../src/assets/assets-drop.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_ASSETS_ORACLE: path.join(path.dirname(bin), 'nt_assets_oracle') })
};
