import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('./transcript.test.ts', import.meta.url))],
  env: ({ bin }) => ({
    NT_ASSIST_BINARY: path.join(path.dirname(bin), 'nt_assist_oracle'),
    NT_TARGETING_OPS: path.join(path.dirname(bin), 'targeting-ops')
  })
};
