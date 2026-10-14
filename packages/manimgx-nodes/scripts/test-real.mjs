// Run the suite against a real manimgx, failing when none is installed
// instead of skipping. The harness gate's expensive selfcheck runs this.
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["../../scripts/run-vitest.mjs", "run", "tests/real-manimgx.test.ts"],
  { stdio: "inherit", env: { ...process.env, NODETOOL_REQUIRE_MANIMGX: "1" } }
);
process.exit(result.status ?? 1);
