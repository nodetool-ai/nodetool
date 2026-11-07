import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  config: 'vitest.config.mts',
  tests: [fileURLToPath(new URL('./assist.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_ASSIST_BINARY: path.join(path.dirname(bin), 'nt_assist_oracle') })
};
