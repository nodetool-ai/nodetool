#!/usr/bin/env node
/**
 * Fake `blender` for `LocalBlenderRunner` tests.
 *
 * The runner scrubs the child environment (D6 step 2), so the mode cannot
 * travel in env: tests copy this file to `fake-<mode>.mjs` and point
 * `BLENDER_PATH` at the copy. The `.mjs` suffix stays so Node keeps the
 * copy an ES module (an extensionless copy exits on unsettled top-level
 * await instead of hanging). `--version` always reports 4.5.0 so binary
 * discovery accepts the fake.
 *
 * Modes: ok, fra, exit64-empty, import-failed, hang, evil, big-output,
 * big-total.
 */

import path from "node:path";
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const argv = process.argv.slice(2);
if (argv.includes("--version")) {
  console.log("Blender 4.5.0 (hash deadbeef)");
  process.exit(0);
}

const mode = path
  .basename(process.argv[1])
  .replace(/^fake-/, "")
  .replace(/\.mjs$/, "");
const job = JSON.parse(readFileSync("job.json", "utf8"));
const outputs = job.outputs ?? {};

function writeResult(result) {
  writeFileSync("result.json", JSON.stringify(result));
}

function writeDeclared(size, unreadable) {
  for (const file of Object.values(outputs)) {
    writeFileSync(file, Buffer.alloc(size, 0x50));
    if (unreadable) chmodSync(file, 0o000);
  }
}

function okStats() {
  return { blender_version: "4.5.0", render_seconds: 0.2 };
}

switch (mode) {
  case "ok": {
    writeDeclared(32, false);
    writeResult({ ok: true, produced: Object.keys(outputs), stats: okStats() });
    break;
  }
  case "fra": {
    process.stderr.write("Fra:1 Mem:10.00M | Time:00:00.10\n");
    process.stderr.write("Fra:2 Mem:10.00M | Time:00:00.10\n");
    process.stderr.write("Fra:3 Mem:10.00M | Time:00:00.10\n");
    writeDeclared(32, false);
    writeResult({ ok: true, produced: Object.keys(outputs), stats: okStats() });
    break;
  }
  case "exit64-empty": {
    process.stderr.write(
      'Traceback (most recent call last):\n  File "run_job.py", line 1\nException: script raised\n'
    );
    process.exit(64);
    break;
  }
  case "import-failed": {
    writeResult({
      ok: false,
      error: { code: "import_failed", message: "glTF importer: unsupported extension KHR_x" }
    });
    break;
  }
  case "hang": {
    // A bare unsettled promise lets the event loop drain and Node exits;
    // a live timer holds it until the runner kills the child.
    setInterval(() => {}, 1000);
    await new Promise(() => {});
    break;
  }
  case "evil": {
    // `produced` names an output the job never declared (no such file is
    // written), and the result smuggles an absolute path: a directory, so
    // any implementation that opens it fails loudly with EISDIR.
    writeDeclared(32, false);
    mkdirSync("sneak", { recursive: true });
    writeResult({
      ok: true,
      produced: [...Object.keys(outputs), "evil"],
      stats: okStats(),
      log_file: path.resolve("sneak")
    });
    break;
  }
  case "big-output": {
    // 64 bytes; the test caps one output at 16. Mode 000 proves the
    // stat-before-read order: opening this file throws for a non-root user.
    writeDeclared(64, true);
    writeResult({ ok: true, produced: Object.keys(outputs), stats: okStats() });
    break;
  }
  case "big-total": {
    // 40 bytes each; the test caps the sum at 100 with four outputs.
    writeDeclared(40, true);
    writeResult({ ok: true, produced: Object.keys(outputs), stats: okStats() });
    break;
  }
  default: {
    process.stderr.write(`unknown fake-blender mode: ${mode}\n`);
    process.exit(1);
  }
}
