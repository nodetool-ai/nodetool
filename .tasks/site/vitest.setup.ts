import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test process gets its own DB file. Set before any module imports the
// db singleton so the path is picked up on first open.
const dir = mkdtempSync(join(tmpdir(), "nodetool-tasks-test-"));
process.env.NODETOOL_TASKS_DB = join(dir, "test.db");
