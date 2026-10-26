import path from "node:path";
import { fileURLToPath } from "node:url";

export default {
  config: "vitest.store.config.mts",
  tests: [fileURLToPath(new URL("../../../src/edit/targeting/targeting-differential.test.ts", import.meta.url))],
  env: ({ bin }) => ({ NT_TARGETING_OPS: path.join(path.dirname(bin), "targeting-ops") })
};
