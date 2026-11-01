import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('../../../src/edit/tracks/track-differential.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_TRACK_OPS: path.join(path.dirname(bin), 'track-ops') })
};
