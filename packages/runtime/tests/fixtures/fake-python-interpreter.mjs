#!/usr/bin/env node
// Thin launcher standing in for a `python` executable. PythonStdioBridge
// always spawns its candidate command with args
// `-m nodetool.worker --stdio [...workerArgs]` (there is no seam to override
// that), so this script IS the "python interpreter" — it ignores those args
// and forwards to the real fake worker (a .ts fixture, run through tsx so it
// can import the shared framing module straight from `src/`).
//
// This process, not the fixture it launches, owns the actual pipe file
// descriptors PythonStdioBridge created via spawn() — so pipe-level faults
// (`FAKE_WORKER_CLOSE_STDIN_AFTER_MS` / `FAKE_WORKER_CLOSE_STDOUT_AFTER_MS`)
// are applied HERE, on this process's own stdin/stdout, and bytes are
// manually piped to/from the fixture's own (separate) pipes. Destroying a
// stream the fixture inherited via `stdio: "inherit"` would not actually
// close the OS pipe — this process would still hold it open — so a genuine
// break requires owning the fd directly.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { closeSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "fake-python-stdio-worker.ts");

const closeStdinAfterMs = process.env.FAKE_WORKER_CLOSE_STDIN_AFTER_MS
  ? Number(process.env.FAKE_WORKER_CLOSE_STDIN_AFTER_MS)
  : null;
const closeStdoutAfterMs = process.env.FAKE_WORKER_CLOSE_STDOUT_AFTER_MS
  ? Number(process.env.FAKE_WORKER_CLOSE_STDOUT_AFTER_MS)
  : null;

// Keep the event loop alive independent of the piped streams below — closing
// our own stdin would otherwise let this process exit naturally once no
// active handles remain, masking the "process stays alive with a half-closed
// pipe" fault under test.
setInterval(() => {}, 1 << 30);

const child = spawn(process.execPath, ["--import", "tsx", fixture], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env
});

// Closing fd 0/1 out from under these streams (below, via closeStdinAfterMs /
// closeStdoutAfterMs) is an INTENTIONAL fault and always produces an 'error'
// here — an unhandled one would crash this process instead of letting the
// fault land on the bridge under test. Log rather than silently swallow: a
// genuinely unexpected error (a real bug, not one of the two knobs) should be
// visible on stderr instead of just making a test hang with no clue why. Every
// source stream in the two `.pipe()` calls below needs one of these — an
// unhandled error on a pipe's SOURCE does not propagate to the destination.
const logPipeError = (label) => (err) => {
  process.stderr.write(`fake-python-interpreter: ${label} stream error: ${err}\n`);
};
process.stdin.on("error", logPipeError("stdin"));
process.stdout.on("error", logPipeError("stdout"));
child.stdin.on("error", logPipeError("child.stdin"));
child.stdout.on("error", logPipeError("child.stdout"));

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
child.on("error", (err) => {
  process.stderr.write(`fake-python-interpreter: failed to launch fixture: ${err}\n`);
  process.exit(1);
});

if (closeStdinAfterMs !== null) {
  setTimeout(() => {
    // `process.stdin.destroy()` only detaches Node's stream wrapper — it does
    // NOT close the underlying fd 0, so the parent never sees a broken pipe.
    // Closing the raw fd is what actually severs the pipe's read end while
    // this process (kept alive by the interval above) keeps running.
    //
    // Unpipe/pause FIRST: closing an fd out from under an active libuv read
    // (the .pipe() below keeps one in flight) can abort the process instead
    // of just erroring, so quiesce the stream before touching the fd.
    process.stdin.unpipe(child.stdin);
    process.stdin.pause();
    try {
      closeSync(0);
    } catch {
      // already closed
    }
  }, closeStdinAfterMs);
}
if (closeStdoutAfterMs !== null) {
  setTimeout(() => {
    try {
      closeSync(1);
    } catch {
      // already closed
    }
  }, closeStdoutAfterMs);
}
