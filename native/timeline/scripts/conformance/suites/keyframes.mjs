import path from "node:path";
import { fileURLToPath } from "node:url";
export default {
  config: "vitest.config.mts",
  tests: [fileURLToPath(new URL("./keyframes.test.ts", import.meta.url))],
  env: ({ bin }) => ({
    NT_KEYFRAME_HELPERS: path.join(path.dirname(bin), "tst_keyframes")
  })
};
