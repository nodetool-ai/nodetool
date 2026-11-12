import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The music frame math, planner and tempo rules (docs/MUSIC-MODE.md MM1 exits 2 and 3).
export default {
  config: 'vitest.config.mts',
  tests: [fileURLToPath(new URL('../../../src/music/music-oracle.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_MUSIC_ORACLE: path.join(path.dirname(bin), 'nt_music_oracle') })
};
