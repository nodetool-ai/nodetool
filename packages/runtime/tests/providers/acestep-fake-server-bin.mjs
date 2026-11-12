#!/usr/bin/env node
/**
 * The fake ace-server as a process, for the supervision tests. It parses the
 * command line the way tools/ace-server.cpp:1646-1711 does and serves the
 * fake API from acestep-fake-server.ts.
 *
 * Test controls, all optional:
 *   FAKE_ACE_ARGS_LOG   append this launch's argv as one JSON line
 *   FAKE_ACE_CRASH_FILE a file holding a count; while it is above zero, the
 *                       process exits when a synth job starts, counting down
 *   FAKE_ACE_JOB_MS     worker time per job
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { startFakeAceServer } from "./acestep-fake-server.ts";

const usage = () => {
  process.stderr.write("Usage: ace-server --models <dir> [options]\n");
  process.exit(1);
};

const argv = process.argv.slice(2);
if (process.env.FAKE_ACE_ARGS_LOG) {
  appendFileSync(process.env.FAKE_ACE_ARGS_LOG, `${JSON.stringify(argv)}\n`);
}
// ace-server.cpp:1635-1639 defaults.
let host = "127.0.0.1";
let port = 8080;
let modelsDir = null;
let maxBatch = 1;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--models" && i + 1 < argv.length) modelsDir = argv[++i];
  else if (arg === "--host" && i + 1 < argv.length) host = argv[++i];
  else if (arg === "--port" && i + 1 < argv.length) port = Number.parseInt(argv[++i], 10);
  else if (arg === "--max-batch" && i + 1 < argv.length) maxBatch = Number.parseInt(argv[++i], 10);
  else if (arg === "--keep-loaded") continue;
  else usage();
}
if (!modelsDir) usage();

// ace-server.cpp:1706-1711: a folder without GGUF files is fatal.
process.stderr.write(`[Server] Scanning models in ${modelsDir}\n`);
let models = [];
try {
  models = readdirSync(modelsDir).filter((name) => name.endsWith(".gguf"));
} catch {
  models = [];
}
if (models.length === 0) {
  process.stderr.write(`[Server] ERROR: no GGUF models found in ${modelsDir}\n`);
  process.exit(1);
}

const crashFile = process.env.FAKE_ACE_CRASH_FILE;
await startFakeAceServer({
  host,
  port,
  // ace-server.cpp:1748-1753 clamps --max-batch to [1, 9].
  maxBatch: Math.min(9, Math.max(1, maxBatch)),
  jobMs: Number(process.env.FAKE_ACE_JOB_MS ?? 50),
  log: (line) => process.stderr.write(`${line}\n`),
  onJobStart: (job) => {
    if (!crashFile || job.kind !== "synth") return;
    const left = Number.parseInt(readFileSync(crashFile, "utf8"), 10) || 0;
    if (left > 0) {
      writeFileSync(crashFile, String(left - 1));
      process.stderr.write(`[Server] FATAL: simulated GGML abort in job ${job.id}\n`);
      process.exit(134);
    }
  }
});
