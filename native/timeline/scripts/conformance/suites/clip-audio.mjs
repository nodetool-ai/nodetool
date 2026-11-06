import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  config: 'vitest.store.config.mts',
  tests: [fileURLToPath(new URL('./clip-audio.test.ts', import.meta.url))],
  env: ({ bin }) => ({ NT_CLIP_AUDIO: path.join(path.dirname(bin), 'tst_clipaudio') })
};
